import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { seededRng } from "@/lib/rng";
import { seedTeams, simulateTick } from "@/lib/simulator";
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
import { loadTournamentView } from "@/lib/view";

// DB-backed. Runs only with DB_TESTS=1 and a reachable Postgres:
//   DB_TESTS=1 npx vitest run src/lib/tournament.test.ts
// KEEP=1 leaves the "rehearsal" tournament in place for manual browsing.
const RUN = process.env.DB_TESTS === "1";
const KEEP = process.env.KEEP === "1";
const SLUG = "rehearsal";

afterAll(async () => {
  await prisma.$disconnect();
});

describe.skipIf(!RUN)("lock → generate → play → bracket advances (integration)", () => {
  let tid: string;
  let adminId: string;

  beforeAll(async () => {
    await prisma.tournament.deleteMany({ where: { slug: SLUG } });
    const admin =
      (await prisma.user.findFirst({ where: { isAdmin: true } })) ??
      (await prisma.user.create({ data: { username: "t-admin", passwordHash: "x", isAdmin: true } }));
    adminId = admin.id;
    const t = await createTournament(
      {
        name: "Rehearsal Cup",
        slug: SLUG,
        description: "Test-mode tournament created by the integration test.",
        startsAt: new Date(Date.now() - 5 * 60_000),
        gameDurationSec: 30,
        breakDurationSec: 10,
        tableCount: 4,
        scoreLabel: "Cups",
        testMode: true,
      },
      adminId,
    );
    tid = t.id;
  });

  afterAll(async () => {
    if (!KEEP) await prisma.tournament.deleteMany({ where: { slug: SLUG } });
  });

  it("seeds 12 teams via the simulator and locks the field", async () => {
    await seedTeams(tid, 12, seededRng(42));
    const n = await prisma.team.count({ where: { tournamentId: tid, status: "CONFIRMED" } });
    expect(n).toBe(12);
    await setTournamentStatus(tid, "LOCKED", adminId);
  });

  it("refuses the simulator on a non-test tournament", async () => {
    const other = await createTournament({ name: "Real", slug: "t-real-x", startsAt: new Date() }, adminId);
    await expect(seedTeams(other.id, 2, seededRng(1))).rejects.toThrow(/test mode/);
    await prisma.tournament.delete({ where: { id: other.id } });
  });

  it("generates 3×4→QF: 5 group slots + QF/SF/Final, 26 matches", async () => {
    await generateTournamentPlan(tid, "g12-3x4-qf", adminId, { seed: 7 });
    const v = (await loadTournamentView(SLUG))!;
    expect(v.groups).toHaveLength(3);
    // 18 group matches over 4 tables pack into 5 slots, then QF, SF, and the
    // final sharing its slot with the third-place match.
    expect(v.slots).toHaveLength(8);
    expect(v.slots.filter((s) => s.stage === "GROUP")).toHaveLength(5);
    expect(v.matches).toHaveLength(18 + 4 + 2 + 1 + 1);
    expect(v.matches.filter((m) => m.stage === "QUARTER").every((m) => !m.teamAId && !m.teamBId)).toBe(true);
  });

  it("refuses to start a round until the schedule is confirmed", async () => {
    const v = (await loadTournamentView(SLUG))!;
    const first = v.slots[0]!;
    await expect(startSlot(first.id, adminId)).rejects.toThrow(/Confirm the schedule/);
    await setTournamentStatus(tid, "READY", adminId);
  });

  it("runs the clock, takes an open report, confirms, and fills the QF once groups finish", async () => {
    let v = (await loadTournamentView(SLUG))!;
    const groupSlots = v.slots.filter((s) => s.stage === "GROUP");
    for (const s of groupSlots) {
      await startSlot(s.id, adminId);
      const ms = v.matches.filter((m) => m.slotId === s.id);
      for (const m of ms) {
        await submitScoreReport(m.id, { scoreA: 10, scoreB: 6, reportedBy: "tester" });
        const fresh = await prisma.match.findUnique({ where: { id: m.id }, include: { reports: true } });
        expect(fresh!.status).toBe("REPORTED");
        expect(fresh!.reports).toHaveLength(1);
        await confirmMatch(m.id, 10, 6, adminId);
      }
      await stopSlot(s.id, adminId);
    }
    v = (await loadTournamentView(SLUG))!;
    expect(v.status).toBe("RUNNING");
    const qfs = v.matches.filter((m) => m.stage === "QUARTER");
    expect(qfs.every((m) => m.teamAId && m.teamBId)).toBe(true);
    const ids = new Set(qfs.flatMap((m) => [m.teamAId, m.teamBId]));
    expect(ids.size).toBe(8);
  });

  it("voiding a group match unresolves the QF, re-confirming restores it", async () => {
    let v = (await loadTournamentView(SLUG))!;
    const before = v.matches.filter((m) => m.stage === "QUARTER").map((m) => [m.teamAId, m.teamBId]);
    const target = v.matches.find((m) => m.stage === "GROUP")!;
    await voidMatch(target.id, adminId);
    v = (await loadTournamentView(SLUG))!;
    expect(v.matches.filter((m) => m.stage === "QUARTER").some((m) => !m.teamAId || !m.teamBId)).toBe(true);
    await confirmMatch(target.id, 10, 6, adminId);
    v = (await loadTournamentView(SLUG))!;
    expect(v.matches.filter((m) => m.stage === "QUARTER").map((m) => [m.teamAId, m.teamBId])).toEqual(before);
  });

  it("simulator ticks the QF through with auto-clock and auto-confirm", async () => {
    const v = (await loadTournamentView(SLUG))!;
    const qf = v.slots.find((s) => s.stage === "QUARTER")!;
    await startSlot(qf.id, adminId);
    const rng = seededRng(3);
    for (let i = 0; i < 40; i++) {
      await simulateTick(tid, { now: new Date(Date.now() + i * 5000), rng, autoClock: true, autoConfirm: true });
      const done = await prisma.match.count({ where: { slotId: qf.id, status: "CONFIRMED" } });
      if (done === 4) break;
    }
    const after = (await loadTournamentView(SLUG))!;
    expect(after.matches.filter((m) => m.stage === "QUARTER").every((m) => m.status === "CONFIRMED")).toBe(true);
    expect(after.matches.filter((m) => m.stage === "SEMI").every((m) => m.teamAId && m.teamBId)).toBe(true);
    // Leave the semi-final ready but not started for manual browsing.
  });

  it("gates score reports: team token only when openScoring is off", async () => {
    await prisma.tournament.update({ where: { id: tid }, data: { openScoring: false } });
    const v = (await loadTournamentView(SLUG))!;
    const sf = v.slots.find((s) => s.stage === "SEMI")!;
    await startSlot(sf.id, adminId);
    const m = v.matches.find((x) => x.slotId === sf.id)!;
    await expect(submitScoreReport(m.id, { scoreA: 5, scoreB: 3 })).rejects.toThrow(/team link/);
    const team = await prisma.team.findUnique({ where: { id: m.teamAId! } });
    await submitScoreReport(m.id, { scoreA: 5, scoreB: 3, teamToken: team!.token });
    const stranger = await prisma.team.findFirst({ where: { tournamentId: tid, id: { notIn: [m.teamAId!, m.teamBId!] } } });
    await expect(submitScoreReport(m.id, { scoreA: 5, scoreB: 3, teamToken: stranger!.token })).rejects.toThrow(/Invalid team link/);
    await prisma.tournament.update({ where: { id: tid }, data: { openScoring: true } });
  });
});

describe.skipIf(!RUN)("double elimination plays through to a grand final (integration)", () => {
  const DE_SLUG = "rehearsal-de";
  let tid: string;
  let adminId: string;

  beforeAll(async () => {
    await prisma.tournament.deleteMany({ where: { slug: DE_SLUG } });
    const admin =
      (await prisma.user.findFirst({ where: { isAdmin: true } })) ??
      (await prisma.user.create({ data: { username: "t-admin", passwordHash: "x", isAdmin: true } }));
    adminId = admin.id;
    const t = await createTournament(
      {
        name: "Rehearsal Double",
        slug: DE_SLUG,
        startsAt: new Date(Date.now() - 5 * 60_000),
        gameDurationSec: 30,
        breakDurationSec: 10,
        tableCount: 4,
        testMode: true,
      },
      adminId,
    );
    tid = t.id;
    await seedTeams(tid, 8, seededRng(9));
    await setTournamentStatus(tid, "LOCKED", adminId);
  });

  afterAll(async () => {
    if (!KEEP) await prisma.tournament.deleteMany({ where: { slug: DE_SLUG } });
  });

  it("stores the losers bracket and grand final stages", async () => {
    await generateTournamentPlan(tid, "de8", adminId, { seed: 4 });
    const v = (await loadTournamentView(DE_SLUG))!;
    expect(v.matches).toHaveLength(14);
    expect(v.matches.filter((m) => m.stage === "LOSERS")).toHaveLength(6);
    expect(v.matches.filter((m) => m.stage === "GRAND_FINAL")).toHaveLength(1);
    // Only the opening winners round knows its teams up front.
    expect(v.matches.filter((m) => m.teamAId && m.teamBId)).toHaveLength(4);
  });

  it("drops beaten teams into the losers bracket as results come in", async () => {
    await setTournamentStatus(tid, "READY", adminId);
    let v = (await loadTournamentView(DE_SLUG))!;
    const beaten: string[] = [];
    for (const s of v.slots) {
      await startSlot(s.id, adminId);
      const fresh = (await loadTournamentView(DE_SLUG))!;
      for (const m of fresh.matches.filter((x) => x.slotId === s.id)) {
        expect(m.teamAId).toBeTruthy();
        expect(m.teamBId).toBeTruthy();
        await confirmMatch(m.id, 10, 6, adminId);
        beaten.push(m.teamBId!);
      }
      await stopSlot(s.id, adminId);
    }
    v = (await loadTournamentView(DE_SLUG))!;
    expect(v.status).toBe("FINISHED");

    // 14 matches, 14 defeats. Side A always won here, so the winners-bracket
    // champion takes the grand final unbeaten and everyone else goes out on a
    // second defeat — the property that makes this double and not single.
    const losses = new Map<string, number>();
    for (const id of beaten) losses.set(id, (losses.get(id) ?? 0) + 1);
    expect(beaten).toHaveLength(14);
    expect(losses.size).toBe(7);
    expect([...losses.values()].every((n) => n === 2)).toBe(true);

    const gf = v.matches.find((m) => m.stage === "GRAND_FINAL")!;
    expect(gf.status).toBe("CONFIRMED");
    expect(losses.get(gf.teamAId!)).toBeUndefined();
  });
});
