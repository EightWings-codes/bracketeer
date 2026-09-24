import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { seededRng } from "@/lib/rng";
import { seedTeams } from "@/lib/simulator";
import { customFormat } from "@/lib/formats";
import {
  createTournament,
  generateTournamentPlan,
  setStageTiming,
  setTournamentStatus,
} from "@/lib/tournament";
import { loadTournamentView } from "@/lib/view";

// DB-backed. Runs only with DB_TESTS=1 and a reachable Postgres:
//   DB_TESTS=1 npx vitest run src/lib/planning.test.ts
const RUN = process.env.DB_TESTS === "1";
const SLUG = "planning-spec";

afterAll(async () => {
  if (RUN) await prisma.tournament.deleteMany({ where: { slug: SLUG } });
  await prisma.$disconnect();
});

describe.skipIf(!RUN)("same groups, different playoff (integration)", () => {
  let tid: string;
  let adminId: string;

  beforeAll(async () => {
    await prisma.tournament.deleteMany({ where: { slug: SLUG } });
    const admin =
      (await prisma.user.findFirst({ where: { isAdmin: true } })) ??
      (await prisma.user.create({ data: { username: "t-admin", passwordHash: "x", isAdmin: true } }));
    adminId = admin.id;
    const t = await createTournament(
      { name: "Planning Spec", slug: SLUG, startsAt: new Date(), gameDurationSec: 600, breakDurationSec: 300, tableCount: 2, testMode: true },
      adminId,
    );
    tid = t.id;
    await seedTeams(tid, 12, seededRng(3));
    await setTournamentStatus(tid, "LOCKED", adminId);
  });

  it("sends 3 groups of 4 to quarter-finals: top 2 + 2 best 3rds", async () => {
    await generateTournamentPlan(tid, customFormat({ teamCount: 12, groupCount: 3, playoffSize: 8 }), adminId, { seed: 7 });
    const v = (await loadTournamentView(SLUG))!;
    expect(v.groups).toHaveLength(3);
    expect(v.matches.filter((m) => m.stage === "QUARTER")).toHaveLength(4);
    expect(v.matches.filter((m) => m.stage === "SEMI")).toHaveLength(2);
    expect(v.formatId).toBe("custom");
  });

  it("sends the same groups straight to semi-finals: winners + best runner-up", async () => {
    await generateTournamentPlan(tid, customFormat({ teamCount: 12, groupCount: 3, playoffSize: 4 }), adminId, { seed: 7 });
    const v = (await loadTournamentView(SLUG))!;
    expect(v.groups).toHaveLength(3);
    expect(v.matches.filter((m) => m.stage === "QUARTER")).toHaveLength(0);
    expect(v.matches.filter((m) => m.stage === "SEMI")).toHaveLength(2);
    expect(v.matches.filter((m) => m.stage === "FINAL")).toHaveLength(1);

    // Three group winners and one wildcard reach the semis.
    const semis = v.matches.filter((m) => m.stage === "SEMI");
    const sources = semis.flatMap((m) => [
      { kind: m.sourceAKind, rank: m.sourceARank },
      { kind: m.sourceBKind, rank: m.sourceBRank },
    ]);
    expect(sources.filter((s) => s.kind === "GROUP_RANK" && s.rank === 1)).toHaveLength(3);
    expect(sources.filter((s) => s.kind === "WILDCARD")).toHaveLength(1);
    // The group stage itself is untouched by the playoff choice.
    expect(v.matches.filter((m) => m.stage === "GROUP")).toHaveLength(18);
  });

  it("gives each stage its own clock, with a longer break before the playoff", async () => {
    await setStageTiming(
      tid,
      {
        GROUP: { gameSec: 480, breakSec: 120, breakAfterStageSec: 1800 },
        SEMI: { gameSec: 900, breakAfterStageSec: 600 },
        FINAL: { gameSec: 1200 },
      },
      adminId,
    );
    const v = (await loadTournamentView(SLUG))!;
    const gap = (a: number, b: number) =>
      (v.slots[b]!.projection.projectedStart.getTime() - v.slots[a]!.projection.projectedEnd.getTime()) / 1000;
    const groupSlots = v.slots.filter((s) => s.stage === "GROUP");
    const last = groupSlots[groupSlots.length - 1]!.index;

    expect((v.slots[0]!.projection.projectedEnd.getTime() - v.slots[0]!.projection.projectedStart.getTime()) / 1000).toBe(480);
    expect(gap(0, 1)).toBe(120); // between two group rounds
    expect(gap(last, last + 1)).toBe(1800); // group stage → semi-finals
    expect(gap(last + 1, last + 2)).toBe(600); // semi-finals → final

    const final = v.slots[v.slots.length - 1]!;
    expect((final.projection.projectedEnd.getTime() - final.projection.projectedStart.getTime()) / 1000).toBe(1200);
  });

  it("still lets a single round override its stage", async () => {
    const v = (await loadTournamentView(SLUG))!;
    await prisma.slot.update({ where: { id: v.slots[0]!.id }, data: { durationSecOverride: 60 } });
    const after = (await loadTournamentView(SLUG))!;
    const p = after.slots[0]!.projection;
    expect((p.projectedEnd.getTime() - p.projectedStart.getTime()) / 1000).toBe(60);
  });
});
