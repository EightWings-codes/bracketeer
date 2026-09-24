import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { seededRng } from "@/lib/rng";
import { seedTeams } from "@/lib/simulator";
import { customFormat } from "@/lib/formats";
import {
  confirmMatch,
  createTournament,
  generateTournamentPlan,
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
