import { describe, expect, it } from "vitest";
import { generatePlan, layoutFirstRound, packGroupStage, seedOrder, snakeGroups, type TeamRef } from "./bracket";
import { findPreset, presetsFor } from "./formats";
import { roundRobinRounds } from "./roundrobin";
import { seededRng } from "./rng";
import { resolveSources, type ResolvableMatch } from "./resolve";

const teams = (n: number): TeamRef[] =>
  Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, name: `Team ${i + 1}`, seed: null }));
const rules = { pointsWin: 3, pointsDraw: 1, pointsLoss: 0 };

describe("seedOrder / snakeGroups", () => {
  it("produces the standard bracket order", () => {
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
  it("snake-seeds 1→A 2→B 3→C 4→C 5→B 6→A", () => {
    const g = snakeGroups(teams(6), 3);
    expect(g.map((x) => x.map((t) => t.id))).toEqual([
      ["t1", "t6"],
      ["t2", "t5"],
      ["t3", "t4"],
    ]);
  });
});

describe("layoutFirstRound", () => {
  it("puts a group's 1st and 2nd in opposite halves (4 groups)", () => {
    const cfg = findPreset("g16-4x4-qf")!;
    const pairs = layoutFirstRound(cfg, ["A", "B", "C", "D"], teams(16));
    expect(pairs).toHaveLength(4);
    const half = (i: number) => (i < 2 ? "top" : "bottom");
    for (const gk of ["A", "B", "C", "D"]) {
      const first = pairs.findIndex((p) => p.some((s) => s.kind === "GROUP_RANK" && s.groupKey === gk && s.rank === 1));
      const second = pairs.findIndex((p) => p.some((s) => s.kind === "GROUP_RANK" && s.groupKey === gk && s.rank === 2));
      expect(half(first)).not.toBe(half(second));
    }
  });
  it("2 groups → A1–B2 / B1–A2", () => {
    const cfg = findPreset("g8-2x4-sf")!;
    const pairs = layoutFirstRound(cfg, ["A", "B"], teams(8));
    expect(pairs).toEqual([
      [{ kind: "GROUP_RANK", groupKey: "A", rank: 1 }, { kind: "GROUP_RANK", groupKey: "B", rank: 2 }],
      [{ kind: "GROUP_RANK", groupKey: "B", rank: 1 }, { kind: "GROUP_RANK", groupKey: "A", rank: 2 }],
    ]);
  });
});

describe("generatePlan", () => {
  it("12 → 3×4 → QF on 4 tables: 18 group matches in 5 slots, QF/SF/Final + 3rd", () => {
    const cfg = findPreset("g12-3x4-qf")!;
    const plan = generatePlan(cfg, teams(12), 4, seededRng(1));
    expect(plan.groups).toHaveLength(3);
    const groupMatches = plan.matches.filter((m) => m.groupKey);
    expect(groupMatches).toHaveLength(18);
    // 18 fixtures over 4 tables is 5 slots — the packer leaves no table idle
    // until the very last one.
    expect(plan.slots.filter((s) => s.stage === "GROUP")).toHaveLength(5);
    expect(plan.slots.filter((s) => s.stage === "QUARTER")).toHaveLength(1);
    expect(plan.slots.filter((s) => s.stage === "SEMI")).toHaveLength(1);
    expect(plan.slots.filter((s) => s.stage === "FINAL")).toHaveLength(1);
    // Third place shares the final's slot on table 2.
    const finalSlot = plan.slots.find((s) => s.stage === "FINAL")!;
    const inFinal = plan.matches.filter((m) => m.slotIndex === finalSlot.index);
    expect(inFinal).toHaveLength(2);
    expect(inFinal.some((m) => m.sourceA.kind === "LOSER")).toBe(true);
    // No table clash inside any slot.
    for (const s of plan.slots) {
      const tables = plan.matches.filter((m) => m.slotIndex === s.index).map((m) => m.tableNo);
      expect(new Set(tables).size).toBe(tables.length);
      expect(Math.max(...tables)).toBeLessThanOrEqual(4);
    }
  });

  it("is reproducible for the same seed and different for another", () => {
    const cfg = findPreset("g12-3x4-qf")!;
    const a = generatePlan(cfg, teams(12), 4, seededRng(7));
    const b = generatePlan(cfg, teams(12), 4, seededRng(7));
    const c = generatePlan(cfg, teams(12), 4, seededRng(8));
    expect(a.groups).toEqual(b.groups);
    expect(a.groups).not.toEqual(c.groups);
  });

  it("honours admin seeds when all are set", () => {
    const cfg = findPreset("g8-2x4-sf")!;
    const seeded = teams(8).map((t, i) => ({ ...t, seed: i + 1 }));
    const plan = generatePlan(cfg, seeded, 2, seededRng(3));
    expect(plan.groups[0]!.teamIds).toEqual(["t1", "t4", "t5", "t8"]);
    expect(plan.groups[1]!.teamIds).toEqual(["t2", "t3", "t6", "t7"]);
  });

  it("pure knockout of 8 uses standard seeding and chains winners", () => {
    const cfg = findPreset("ko8")!;
    const seeded = teams(8).map((t, i) => ({ ...t, seed: i + 1 }));
    const plan = generatePlan(cfg, seeded, 4, seededRng(1));
    const qf = plan.matches.filter((m) => m.slotIndex === 0);
    expect(qf[0]!.sourceA).toEqual({ kind: "TEAM", teamId: "t1" });
    expect(qf[0]!.sourceB).toEqual({ kind: "TEAM", teamId: "t8" });
    const sf = plan.matches.filter((m) => plan.slots[m.slotIndex]!.stage === "SEMI");
    expect(sf[0]!.sourceA).toEqual({ kind: "WINNER", matchKey: qf[0]!.key });
    expect(sf[0]!.sourceB).toEqual({ kind: "WINNER", matchKey: qf[1]!.key });
  });

  it("round robin for any count has no knockout", () => {
    const plan = generatePlan(findPreset("rr")!, teams(5), 2, seededRng(1));
    expect(plan.matches).toHaveLength(10);
    expect(plan.matches.every((m) => m.groupKey === "A")).toBe(true);
  });

  it("offers only fitting presets for a team count", () => {
    expect(presetsFor(12).map((p) => p.id)).toEqual(["g12-3x4-qf", "rr"]);
    expect(presetsFor(8).map((p) => p.id)).toEqual(["g8-2x4-sf", "ko8", "de8", "rr"]);
    expect(presetsFor(32).map((p) => p.id)).toEqual(["ko32", "de32", "rr"]);
  });

  it("rejects a wrong team count", () => {
    expect(() => generatePlan(findPreset("g12-3x4-qf")!, teams(11), 4, seededRng(1))).toThrow(
      /exactly 12/,
    );
  });
});

/**
 * Full 12-team walk-through: generate → play all 18 group matches → QF
 * pairings are the expected teams → void one → QF reset → re-confirm → back.
 */
describe("12-team walk-through with resolveSources", () => {
  const cfg = findPreset("g12-3x4-qf")!;
  const ts = teams(12).map((t, i) => ({ ...t, seed: i + 1 }));
  const plan = generatePlan(cfg, ts, 4, seededRng(1));
  const groupIdOf = (key: string) => `g-${key}`;

  // Materialise the plan into ResolvableMatch rows the way the DB layer would.
  const matches: ResolvableMatch[] = plan.matches.map((m) => {
    const src = (s: typeof m.sourceA) => ({
      kind: s.kind,
      matchId: "matchKey" in s ? s.matchKey : null,
      groupId: "groupKey" in s ? groupIdOf(s.groupKey) : null,
      rank: "rank" in s ? s.rank : null,
      teamId: s.kind === "TEAM" ? s.teamId : null,
    });
    const a = src(m.sourceA);
    const b = src(m.sourceB);
    return {
      id: m.key,
      slotIndex: m.slotIndex,
      status: "SCHEDULED",
      slotStarted: false,
      groupId: m.groupKey ? groupIdOf(m.groupKey) : null,
      teamAId: a.teamId,
      teamBId: b.teamId,
      scoreA: null,
      scoreB: null,
      sourceAKind: a.kind,
      sourceAMatchId: a.matchId,
      sourceAGroupId: a.groupId,
      sourceARank: a.rank,
      sourceBKind: b.kind,
      sourceBMatchId: b.matchId,
      sourceBGroupId: b.groupId,
      sourceBRank: b.rank,
    };
  });
  const groups = plan.groups.map((g) => ({
    id: groupIdOf(g.key),
    teams: g.teamIds.map((id) => ({ id, name: id })),
  }));
  const input = { matches, groups, rules, wildcardPosition: 3 };
  const apply = () => {
    const r = resolveSources(input);
    for (const u of r.updates) {
      const m = matches.find((x) => x.id === u.id)!;
      m.teamAId = u.teamAId;
      m.teamBId = u.teamBId;
    }
    return r;
  };
  // Lower team number always wins, by a margin that grows with the gap.
  const num = (id: string) => Number(id.slice(1));
  const play = (m: ResolvableMatch) => {
    const a = num(m.teamAId!);
    const b = num(m.teamBId!);
    m.scoreA = a < b ? 10 : 10 - (a - b);
    m.scoreB = b < a ? 10 : 10 - (b - a);
    m.status = "CONFIRMED";
  };

  it("fills the QF only when groups are complete, with the expected teams", () => {
    const groupMs = matches.filter((m) => m.groupId);
    // Play all but one, nothing resolves yet for that group.
    for (const m of groupMs.slice(0, -1)) play(m);
    apply();
    const qfs = matches.filter((m) => plan.slots[m.slotIndex]!.stage === "QUARTER");
    expect(qfs).toHaveLength(4);
    const lastGroup = groupMs[groupMs.length - 1]!.groupId;
    const dependsOnLast = (m: ResolvableMatch) =>
      m.sourceAGroupId === lastGroup || m.sourceBGroupId === lastGroup ||
      m.sourceAKind === "WILDCARD" || m.sourceBKind === "WILDCARD";
    for (const q of qfs) if (dependsOnLast(q)) expect(q.teamAId === null || q.teamBId === null).toBe(true);

    play(groupMs[groupMs.length - 1]!);
    const r = apply();
    expect(r.outOfSync).toEqual([]);
    for (const q of qfs) {
      expect(q.teamAId).not.toBeNull();
      expect(q.teamBId).not.toBeNull();
    }
    // Snake seeding: A={1,6,7,12}, B={2,5,8,11}, C={3,4,9,10}; winners 1,2,3;
    // runners-up 6,5,4; thirds 7,8,9 → wildcards 7,8. Qualifiers = 1..8.
    const qualifiers = qfs.flatMap((q) => [q.teamAId, q.teamBId]).map((id) => num(id!)).sort((x, y) => x - y);
    expect(qualifiers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // No QF pairs two GROUP_RANK teams from the same group.
    for (const q of qfs) {
      if (q.sourceAKind === "GROUP_RANK" && q.sourceBKind === "GROUP_RANK") {
        expect(q.sourceAGroupId).not.toBe(q.sourceBGroupId);
      }
    }
  });

  it("voiding a group match clears the affected QF teams; re-confirming restores them", () => {
    const groupA = groupIdOf("A");
    const target = matches.find((m) => m.groupId === groupA)!;
    const before = matches
      .filter((m) => plan.slots[m.slotIndex]!.stage === "QUARTER")
      .map((m) => [m.teamAId, m.teamBId]);

    target.status = "VOID";
    apply();
    const qfs = matches.filter((m) => plan.slots[m.slotIndex]!.stage === "QUARTER");
    // Wildcards depend on every group, so with A incomplete every QF loses something.
    expect(qfs.some((q) => q.teamAId === null || q.teamBId === null)).toBe(true);
    const aFed = qfs.filter((q) => q.sourceAGroupId === groupA || q.sourceBGroupId === groupA);
    expect(aFed.length).toBeGreaterThan(0);
    for (const q of aFed) {
      if (q.sourceAGroupId === groupA) expect(q.teamAId).toBeNull();
      if (q.sourceBGroupId === groupA) expect(q.teamBId).toBeNull();
    }

    target.status = "CONFIRMED";
    apply();
    const after = qfs.map((m) => [m.teamAId, m.teamBId]);
    expect(after).toEqual(before);
  });

  it("chains winners through SF and final, and flags a started match instead of touching it", () => {
    const qfs = matches.filter((m) => plan.slots[m.slotIndex]!.stage === "QUARTER");
    for (const q of qfs) play(q);
    apply();
    const sfs = matches.filter((m) => plan.slots[m.slotIndex]!.stage === "SEMI");
    expect(sfs.every((m) => m.teamAId && m.teamBId)).toBe(true);
    for (const s of sfs) play(s);
    apply();
    const finalSlot = plan.slots.find((s) => s.stage === "FINAL")!;
    const inFinal = matches.filter((m) => m.slotIndex === finalSlot.index);
    const final = inFinal.find((m) => m.sourceAKind === "WINNER")!;
    const third = inFinal.find((m) => m.sourceAKind === "LOSER")!;
    // With 3 groups two winners must share a half, so 1 meets 2 in the semi.
    const sfWinners = sfs.map((s) => Math.min(num(s.teamAId!), num(s.teamBId!))).sort();
    const sfLosers = sfs.map((s) => Math.max(num(s.teamAId!), num(s.teamBId!))).sort();
    expect([num(final.teamAId!), num(final.teamBId!)].sort()).toEqual(sfWinners);
    expect([num(third.teamAId!), num(third.teamBId!)].sort()).toEqual(sfLosers);
    expect(sfWinners).toEqual([1, 3]);

    // Now the final has started; voiding a semi must not change it.
    final.slotStarted = true;
    third.slotStarted = true;
    sfs[0]!.status = "VOID";
    const r = apply();
    expect(r.outOfSync).toContain(final.id);
    expect(final.teamAId).not.toBeNull();
  });
});

describe("single elimination", () => {
  it.each([
    [8, "ko8", 4],
    [16, "ko16", 8],
    [32, "ko32", 16],
  ])("%i teams produce a full bracket", (n, id, firstRound) => {
    const seeded = teams(n).map((t, i) => ({ ...t, seed: i + 1 }));
    const plan = generatePlan(findPreset(id)!, seeded, firstRound, seededRng(7));
    // n-1 knockout matches, plus the 3rd-place match these presets carry.
    expect(plan.matches).toHaveLength(n - 1 + 1);
    const entrants = plan.matches.flatMap((m) => [m.sourceA, m.sourceB]).filter((x) => x.kind === "TEAM");
    expect(entrants).toHaveLength(n);
    const opener = plan.matches.filter((m) => m.slotIndex === 0);
    expect(opener).toHaveLength(firstRound);
    // Seeds meet in the standard order: 1 v n, then 2 v n-1 in the other half.
    expect(opener[0]!.sourceA).toEqual({ kind: "TEAM", teamId: "t1" });
    expect(opener[0]!.sourceB).toEqual({ kind: "TEAM", teamId: `t${n}` });
    expect(plan.slots.filter((s) => s.stage === "FINAL")).toHaveLength(1);
  });
});

describe("double elimination", () => {
  it.each([
    [8, "de8"],
    [16, "de16"],
    [32, "de32"],
  ])("%i teams play 2n−2 matches with a losers bracket", (n, id) => {
    const plan = generatePlan(findPreset(id)!, teams(n), n / 2, seededRng(3));
    expect(plan.matches).toHaveLength(2 * n - 2);

    const stageOf = (m: (typeof plan.matches)[number]) => plan.slots[m.slotIndex]!.stage;
    const k = Math.log2(n);
    expect(plan.matches.filter((m) => stageOf(m) === "LOSERS")).toHaveLength(n - 2);
    expect(plan.matches.filter((m) => stageOf(m) === "GRAND_FINAL")).toHaveLength(1);
    // Every team enters once, in the winners bracket.
    const entrants = plan.matches.flatMap((m) => [m.sourceA, m.sourceB]).filter((x) => x.kind === "TEAM");
    expect(new Set(entrants.map((x) => (x as { teamId: string }).teamId)).size).toBe(n);
    expect(plan.slots.filter((s) => s.label.startsWith("Losers round"))).toHaveLength(2 * (k - 1));
    expect(plan.groups).toHaveLength(0);
  });

  it("schedules every source before the match that consumes it", () => {
    const plan = generatePlan(findPreset("de8")!, teams(8), 4, seededRng(11));
    const slotOf = new Map(plan.matches.map((m) => [m.key, m.slotIndex]));
    for (const m of plan.matches) {
      for (const src of [m.sourceA, m.sourceB]) {
        if (src.kind !== "WINNER" && src.kind !== "LOSER") continue;
        expect(slotOf.get(src.matchKey)!).toBeLessThan(m.slotIndex);
      }
    }
  });

  it("sends every first-round loser into the losers bracket exactly once", () => {
    const plan = generatePlan(findPreset("de8")!, teams(8), 4, seededRng(5));
    const openers = plan.matches.filter((m) => m.slotIndex === 0).map((m) => m.key);
    const dropped = plan.matches
      .flatMap((m) => [m.sourceA, m.sourceB])
      .filter((s) => s.kind === "LOSER")
      .map((s) => (s as { matchKey: string }).matchKey);
    for (const key of openers) expect(dropped.filter((d) => d === key)).toHaveLength(1);
    // The grand final takes the two survivors, never a loser reference.
    const gf = plan.matches.find((m) => plan.slots[m.slotIndex]!.stage === "GRAND_FINAL")!;
    expect(gf.sourceA.kind).toBe("WINNER");
    expect(gf.sourceB.kind).toBe("WINNER");
  });

  it("plays the whole de8 bracket out to one champion", () => {
    const plan = generatePlan(findPreset("de8")!, teams(8), 4, seededRng(2));
    // Lower team number always wins; team 1 must take the grand final.
    const num = (id: string) => Number(id.slice(1));
    const winnerOf = new Map<string, string>();
    const loserOf = new Map<string, string>();
    const side = (s: (typeof plan.matches)[number]["sourceA"]): string => {
      if (s.kind === "TEAM") return s.teamId;
      if (s.kind === "WINNER") return winnerOf.get(s.matchKey)!;
      if (s.kind === "LOSER") return loserOf.get(s.matchKey)!;
      throw new Error(`Unexpected source in a double-elimination plan: ${s.kind}`);
    };

    for (const m of [...plan.matches].sort((a, b) => a.slotIndex - b.slotIndex)) {
      const a = side(m.sourceA);
      const b = side(m.sourceB);
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      winnerOf.set(m.key, num(a) < num(b) ? a : b);
      loserOf.set(m.key, num(a) < num(b) ? b : a);
    }
    const gf = plan.matches.find((m) => plan.slots[m.slotIndex]!.stage === "GRAND_FINAL")!;
    expect(winnerOf.get(gf.key)).toBe("t1");
    // Runner-up came up through the losers bracket after losing to team 1.
    expect(loserOf.get(gf.key)).toBe("t2");
  });
});

describe("packGroupStage", () => {
  const groupFixtures = (key: string, size: number) =>
    roundRobinRounds(size).flatMap((pairs, round) =>
      pairs.map(([a, b]) => ({ groupKey: key, round, teamAId: `${key}${a}`, teamBId: `${key}${b}` })),
    );

  const field = (...groups: Array<[string, number]>) => groups.flatMap(([k, n]) => groupFixtures(k, n));

  /** The invariants a packing must hold whatever the field and table count. */
  const check = (all: ReturnType<typeof field>, tables: number) => {
    const slots = packGroupStage(all, tables);
    expect(slots.flat()).toHaveLength(all.length);
    expect(new Set(slots.flat())).toEqual(new Set(all));

    slots.forEach((slot, i) => {
      expect(slot.length).toBeLessThanOrEqual(tables);
      const sides = slot.flatMap((f) => [f.teamAId, f.teamBId]);
      expect(new Set(sides).size).toBe(sides.length);

      // A table is only ever left standing because every fixture still to come
      // needs a team that is already playing in this slot.
      if (slot.length < tables) {
        const busy = new Set(sides);
        for (const later of slots.slice(i + 1).flat()) {
          expect(busy.has(later.teamAId) || busy.has(later.teamBId)).toBe(true);
        }
      }
    });
    return slots.map((s) => s.length);
  };

  it("keeps every table busy while fixtures remain", () => {
    const two = field(["A", 4], ["B", 4]);
    // Round-by-round chunking gave 3 + 1 on three tables; packing gives 3 + 3 + 3 + 3.
    expect(check(two, 3)).toEqual([3, 3, 3, 3]);
    expect(check(two, 2)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(check(two, 1)).toHaveLength(12);
  });

  it("reaches the fewest slots the tables allow", () => {
    const three = field(["A", 4], ["B", 4], ["C", 4]);
    expect(check(three, 4)).toEqual([4, 4, 4, 4, 2]); // 18 matches, 5 slots — the minimum
    expect(check(three, 3)).toEqual([3, 3, 3, 3, 3, 3]);
  });

  it("packs uneven groups too", () => {
    const nine = field(["A", 5], ["B", 4]); // 9 teams: 10 + 6 matches
    expect(check(nine, 3)).toEqual([3, 3, 3, 3, 2, 2]); // 16 matches in ceil(16/3) slots
    // A group of five can only ever play two matches at once, so its ten
    // matches need five slots however many tables the hall has.
    expect(check(nine, 4)).toHaveLength(5);
  });

  it("never asks a group for more matches than its teams allow", () => {
    const two = field(["A", 4], ["B", 4]);
    // Eight tables, eight teams: four matches at once is the ceiling.
    expect(check(two, 8)).toEqual([4, 4, 4]);
  });
});
