import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { seededRng } from "@/lib/rng";
import { seedTeams } from "@/lib/simulator";
import { customFormat } from "@/lib/formats";
import {
  confirmMatch,
  createTournament,
  generateTournamentPlan,
  replanPlayoff,
  setTournamentStatus,
  startSlot,
  stopSlot,
  submitScoreReport,
  voidMatch,
} from "@/lib/tournament";

// DB-backed. Runs only with DB_TESTS=1 and a reachable Postgres:
//   DB_TESTS=1 npx vitest run src/lib/scoring.test.ts
const RUN = process.env.DB_TESTS === "1";
const SLUG = "scoring-spec";

afterAll(async () => {
  if (RUN) await prisma.tournament.deleteMany({ where: { slug: SLUG } });
  await prisma.$disconnect();
});

async function build() {
  await prisma.tournament.deleteMany({ where: { slug: SLUG } });
  const admin =
    (await prisma.user.findFirst({ where: { isAdmin: true } })) ??
    (await prisma.user.create({ data: { username: "t-admin", passwordHash: "x", isAdmin: true } }));
  const t = await createTournament(
    { name: "Scoring Spec", slug: SLUG, startsAt: new Date(), tableCount: 3, testMode: true },
    admin.id,
  );
  await seedTeams(t.id, 9, seededRng(2));
  await setTournamentStatus(t.id, "LOCKED", admin.id);
  await generateTournamentPlan(t.id, customFormat({ teamCount: 9, groupCount: 2, playoffSize: 8 }), admin.id, { seed: 3 });
  await setTournamentStatus(t.id, "READY", admin.id);
  return { id: t.id, adminId: admin.id };
}

describe.skipIf(!RUN)("reporting a result after the round is over (integration)", () => {
  let tid: string;
  let adminId: string;

  beforeEach(async () => {
    const built = await build();
    tid = built.id;
    adminId = built.adminId;
  });

  /** Play the first round out without anyone entering a score. */
  async function runAndEndFirstRound() {
    const slot = await prisma.slot.findFirstOrThrow({ where: { tournamentId: tid }, orderBy: { index: "asc" }, include: { matches: true } });
    await startSlot(slot.id, adminId);
    await stopSlot(slot.id, adminId);
    return prisma.slot.findUniqueOrThrow({ where: { id: slot.id }, include: { matches: true } });
  }

  it("takes a score for a match whose round has finished", async () => {
    const slot = await runAndEndFirstRound();
    const m = slot.matches[0]!;
    await submitScoreReport(m.id, { scoreA: 10, scoreB: 7, reportedBy: "a bystander", teamToken: null });
    const after = await prisma.match.findUniqueOrThrow({ where: { id: m.id }, include: { reports: true } });
    expect(after.status).toBe("REPORTED");
    expect(after.reports).toHaveLength(1);
    expect(after.reports[0]).toMatchObject({ scoreA: 10, scoreB: 7, reportedBy: "a bystander" });
  });

  it("still refuses a round that never started", async () => {
    const later = await prisma.slot.findFirstOrThrow({ where: { tournamentId: tid, startedAt: null }, orderBy: { index: "asc" }, include: { matches: true } });
    await expect(
      submitScoreReport(later.matches[0]!.id, { scoreA: 1, scoreB: 0, reportedBy: null, teamToken: null }),
    ).rejects.toThrow(/hasn't started/);
  });

  it("stays locked once the organiser has confirmed or voided it", async () => {
    const slot = await runAndEndFirstRound();
    const [settled, voided] = slot.matches;
    await confirmMatch(settled!.id, 10, 4, adminId);
    await voidMatch(voided!.id, adminId, "table collapsed");

    await expect(
      submitScoreReport(settled!.id, { scoreA: 1, scoreB: 0, reportedBy: null, teamToken: null }),
    ).rejects.toThrow(/already confirmed/i);
    await expect(
      submitScoreReport(voided!.id, { scoreA: 1, scoreB: 0, reportedBy: null, teamToken: null }),
    ).rejects.toThrow(/voided/i);
  });

  it("lets a later report correct an earlier one", async () => {
    const slot = await runAndEndFirstRound();
    const m = slot.matches[0]!;
    await submitScoreReport(m.id, { scoreA: 10, scoreB: 7, reportedBy: "first", teamToken: null });
    await submitScoreReport(m.id, { scoreA: 10, scoreB: 8, reportedBy: "second", teamToken: null });
    const after = await prisma.match.findUniqueOrThrow({ where: { id: m.id }, include: { reports: { orderBy: { createdAt: "desc" } } } });
    expect(after.reports).toHaveLength(2);
    expect(after.status).toBe("REPORTED");
  });
});

describe.skipIf(!RUN)("replanPlayoff (integration)", () => {
  let tid: string;
  let adminId: string;

  beforeEach(async () => {
    const built = await build();
    tid = built.id;
    adminId = built.adminId;
  });

  /** Play the whole group stage out, so the playoff has real teams to resolve. */
  async function playGroups() {
    const slots = await prisma.slot.findMany({ where: { tournamentId: tid, stage: "GROUP" }, orderBy: { index: "asc" }, include: { matches: true } });
    for (const s of slots) {
      await startSlot(s.id, adminId);
      for (const [i, m] of s.matches.entries()) await confirmMatch(m.id, 10, i + 1, adminId);
      await stopSlot(s.id, adminId);
    }
  }

  it("swaps quarter-finals for semis plus places, leaving the groups alone", async () => {
    const groupsBefore = await prisma.slot.findMany({ where: { tournamentId: tid, stage: "GROUP" }, orderBy: { index: "asc" }, include: { matches: true } });
    await startSlot(groupsBefore[0]!.id, adminId);

    await replanPlayoff(tid, customFormat({ teamCount: 9, groupCount: 2, playoffSize: 4, thirdPlaceMatch: true, placementGames: true }), adminId);

    const after = await prisma.slot.findMany({ where: { tournamentId: tid }, orderBy: { index: "asc" }, include: { matches: true } });
    const groupsAfter = after.filter((s) => s.stage === "GROUP");
    expect(groupsAfter.map((s) => s.id)).toEqual(groupsBefore.map((s) => s.id));
    expect(groupsAfter.flatMap((s) => s.matches.map((m) => m.id)).sort()).toEqual(
      groupsBefore.flatMap((s) => s.matches.map((m) => m.id)).sort(),
    );

    // Three tables: semis + 7th place, then final + 3rd + 5th.
    const knockout = after.filter((s) => s.stage !== "GROUP");
    expect(knockout).toHaveLength(2);
    expect(knockout.map((s) => s.matches.length)).toEqual([3, 3]);
    expect(knockout[0]!.stage).toBe("SEMI");
    expect(knockout[1]!.stage).toBe("FINAL");

    // The extra game in each round is a placement game between equal ranks, and
    // the lower place runs first: 7th beside the semis, 5th beside the final.
    const placeRank = (s: (typeof knockout)[number]) =>
      s.matches.find((m) => m.sourceAKind === "GROUP_RANK" && m.sourceARank === m.sourceBRank)?.sourceARank;
    expect(placeRank(knockout[0]!)).toBe(4); // 7th place, with the semi-finals
    expect(placeRank(knockout[1]!)).toBe(3); // 5th place, with the final
  });

  it("resolves the placement games once the groups are done", async () => {
    await replanPlayoff(tid, customFormat({ teamCount: 9, groupCount: 2, playoffSize: 4, thirdPlaceMatch: true, placementGames: true }), adminId);
    await playGroups();
    const seventh = await prisma.match.findFirstOrThrow({
      where: { tournamentId: tid, sourceARank: 4, sourceBRank: 4 },
    });
    expect(seventh.teamAId).not.toBeNull();
    expect(seventh.teamBId).not.toBeNull();
  });

  it("refuses once the playoff itself has started", async () => {
    const semi = await prisma.slot.findFirstOrThrow({ where: { tournamentId: tid, stage: { not: "GROUP" } }, orderBy: { index: "asc" } });
    await prisma.slot.update({ where: { id: semi.id }, data: { startedAt: new Date() } });
    await expect(
      replanPlayoff(tid, customFormat({ teamCount: 9, groupCount: 2, playoffSize: 4 }), adminId),
    ).rejects.toThrow(/already begun/);
  });
});
