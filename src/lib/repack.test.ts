import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { seededRng } from "@/lib/rng";
import { seedTeams } from "@/lib/simulator";
import { customFormat } from "@/lib/formats";
import {
  createTournament,
  generateTournamentPlan,
  repackUpcomingRounds,
  setTournamentStatus,
  startSlot,
} from "@/lib/tournament";

// DB-backed. Runs only with DB_TESTS=1 and a reachable Postgres:
//   DB_TESTS=1 npx vitest run src/lib/repack.test.ts
const RUN = process.env.DB_TESTS === "1";
const SLUG = "repack-spec";

afterAll(async () => {
  if (RUN) await prisma.tournament.deleteMany({ where: { slug: SLUG } });
  await prisma.$disconnect();
});

/** The shape a live tournament is in: 9 teams, 5 + 4, three tables. */
async function build() {
  await prisma.tournament.deleteMany({ where: { slug: SLUG } });
  const admin =
    (await prisma.user.findFirst({ where: { isAdmin: true } })) ??
    (await prisma.user.create({ data: { username: "t-admin", passwordHash: "x", isAdmin: true } }));
  const t = await createTournament(
    { name: "Repack Spec", slug: SLUG, startsAt: new Date(), tableCount: 3, testMode: true },
    admin.id,
  );
  await seedTeams(t.id, 9, seededRng(2));
  await setTournamentStatus(t.id, "LOCKED", admin.id);
  await generateTournamentPlan(t.id, customFormat({ teamCount: 9, groupCount: 2, playoffSize: 8 }), admin.id, { seed: 3 });
  await setTournamentStatus(t.id, "READY", admin.id);
  return { id: t.id, adminId: admin.id };
}

/**
 * Undo the packing, the way the old round-by-round planner left it: every
 * group round split into a full slot and a remainder slot.
 */
async function scatter(tournamentId: string) {
  const slots = await prisma.slot.findMany({ where: { tournamentId }, orderBy: { index: "asc" }, include: { matches: true } });
  let park = 1000;
  const order: string[] = [];
  for (const s of slots) {
    await prisma.slot.update({ where: { id: s.id }, data: { index: park++ } });
    order.push(s.id);
    const extras = s.stage === "GROUP" ? s.matches.filter((m) => m.tableNo > 1) : [];
    if (extras.length === 0) continue;
    const spill = await prisma.slot.create({
      data: { tournamentId, index: park++, label: `${s.label} (spill)`, stage: "GROUP" },
    });
    order.push(spill.id);
    for (const [i, m] of extras.entries()) {
      await prisma.match.update({ where: { id: m.id }, data: { slotId: spill.id, tableNo: i + 1 } });
    }
  }
  // Renumber so the spill rounds sit directly behind the round they came from.
  for (const [i, id] of order.entries()) {
    await prisma.slot.update({ where: { id }, data: { index: i } });
  }
}

const snapshot = async (tournamentId: string) => {
  const matches = await prisma.match.findMany({ where: { tournamentId }, orderBy: { id: "asc" }, include: { slot: true } });
  return matches.map((m) => ({ id: m.id, a: m.teamAId, b: m.teamBId, group: m.groupId, status: m.status, stage: m.slot.stage }));
};

describe.skipIf(!RUN)("repackUpcomingRounds (integration)", () => {
  let tid: string;
  let adminId: string;

  beforeEach(async () => {
    const built = await build();
    tid = built.id;
    adminId = built.adminId;
  });

  it("compacts a scattered group stage onto every table", async () => {
    await scatter(tid);
    const before = await snapshot(tid);
    const groupSlotsBefore = await prisma.slot.count({ where: { tournamentId: tid, stage: "GROUP" } });

    const result = await repackUpcomingRounds(tid, adminId);

    const slots = await prisma.slot.findMany({ where: { tournamentId: tid, stage: "GROUP" }, orderBy: { index: "asc" }, include: { matches: true } });
    expect(groupSlotsBefore).toBeGreaterThan(slots.length);
    expect(result.slotsAfter).toBe(slots.length);
    // 16 group fixtures over 3 tables: six rounds, none of them idle early.
    expect(slots.map((s) => s.matches.length)).toEqual([3, 3, 3, 3, 2, 2]);
    // Same fixtures, same opponents, same groups — only the round and table moved.
    expect(await snapshot(tid)).toEqual(before);
  });

  it("never touches a round that is running, nor anything before it", async () => {
    await scatter(tid);
    const first = await prisma.slot.findFirstOrThrow({ where: { tournamentId: tid }, orderBy: { index: "asc" }, include: { matches: true } });
    await startSlot(first.id, adminId);
    const frozen = first.matches.map((m) => ({ id: m.id, tableNo: m.tableNo, slotId: m.slotId })).sort((a, b) => a.id.localeCompare(b.id));

    await repackUpcomingRounds(tid, adminId);

    const after = await prisma.slot.findUniqueOrThrow({ where: { id: first.id }, include: { matches: true } });
    expect(after.startedAt).not.toBeNull();
    expect(after.label).toBe(first.label);
    expect(after.matches.map((m) => ({ id: m.id, tableNo: m.tableNo, slotId: m.slotId })).sort((a, b) => a.id.localeCompare(b.id))).toEqual(frozen);
  });

  it("leaves the knockout alone, sources and all", async () => {
    await scatter(tid);
    const before = await prisma.match.findMany({
      where: { tournamentId: tid, groupId: null },
      orderBy: { id: "asc" },
      select: { id: true, slotId: true, tableNo: true, sourceAKind: true, sourceAGroupId: true, sourceARank: true, sourceAMatchId: true },
    });

    await repackUpcomingRounds(tid, adminId);

    const after = await prisma.match.findMany({
      where: { tournamentId: tid, groupId: null },
      orderBy: { id: "asc" },
      select: { id: true, slotId: true, tableNo: true, sourceAKind: true, sourceAGroupId: true, sourceARank: true, sourceAMatchId: true },
    });
    expect(after).toEqual(before);
  });

  it("is a no-op on a plan that is already packed", async () => {
    const before = await prisma.slot.findMany({ where: { tournamentId: tid }, orderBy: { index: "asc" }, include: { matches: true } });
    const result = await repackUpcomingRounds(tid, adminId);
    expect(result.removed).toBe(0);
    expect(result.moved).toBe(0);
    const after = await prisma.slot.findMany({ where: { tournamentId: tid }, orderBy: { index: "asc" }, include: { matches: true } });
    expect(after.map((s) => s.matches.length)).toEqual(before.map((s) => s.matches.length));
  });

  it("reports what it would do without touching anything on a dry run", async () => {
    await scatter(tid);
    const before = await prisma.slot.count({ where: { tournamentId: tid } });
    const result = await repackUpcomingRounds(tid, adminId, { dryRun: true });
    expect(result.removed).toBeGreaterThan(0);
    expect(await prisma.slot.count({ where: { tournamentId: tid } })).toBe(before);
  });
});
