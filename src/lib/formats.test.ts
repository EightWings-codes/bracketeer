import { describe, expect, it } from "vitest";
import {
  customFormat,
  describeGroups,
  describeCustom,
  groupOptions,
  playoffLabel,
  playoffOptions,
  qualifierCount,
  validateFormat,
} from "@/lib/formats";
import { generatePlan, snakeGroupSizes } from "@/lib/bracket";
import { seededRng } from "@/lib/rng";

const teams = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, name: `Team ${i + 1}`, seed: null }));

describe("groupOptions", () => {
  it("offers every layout that leaves no group below two teams", () => {
    expect(groupOptions(12)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(groupOptions(7)).toEqual([1, 2, 3]);
  });

  it("offers uneven layouts for a field that does not divide", () => {
    // 9 teams: one table, 5+4, or 3+3+3, or 3+2+2+2.
    expect(groupOptions(9)).toEqual([1, 2, 3, 4]);
    expect(snakeGroupSizes(9, 2)).toEqual([5, 4]);
    expect(snakeGroupSizes(9, 3)).toEqual([3, 3, 3]);
  });
});

describe("nine teams, groups of 5 and 4", () => {
  const nine = { teamCount: 9, groupCount: 2 };

  it("is a legal format all the way to the final", () => {
    for (const playoffSize of [0, 2, 4, 8]) {
      const f = customFormat({ ...nine, playoffSize });
      expect(validateFormat(f, 9)).toBeNull();
    }
    expect(playoffOptions(9, 2)).toEqual([0, 2, 4, 8]);
  });

  it("reads back as the two group sizes", () => {
    expect(describeGroups(9, 2)).toBe("2 groups — 1 of 5 and 1 of 4");
    expect(describeCustom({ ...nine, playoffSize: 4 })).toBe(
      "9 teams · 2 groups — 1 of 5 and 1 of 4 · top 2 · semi-finals",
    );
  });

  it("takes the smallest group as the limit on who advances", () => {
    // Top 4 of each is 8 — the group of 4 can just supply it.
    expect(customFormat({ ...nine, playoffSize: 8 })).toMatchObject({ groupSize: 4, advancePerGroup: 4, wildcards: 0 });
    // A config that asks a group for more than it holds is refused, however it
    // was arrived at — here 4 groups (3, 2, 2, 2) asked for their top 3.
    const tooGreedy = { ...customFormat({ teamCount: 9, groupCount: 4, playoffSize: 8 }), advancePerGroup: 3, wildcards: 4 };
    expect(validateFormat(tooGreedy, 9)).toMatch(/smallest group/);
  });

  it("plans a full round robin in each group and a knockout after it", () => {
    const plan = generatePlan(customFormat({ ...nine, playoffSize: 4 }), teams(9), 2, seededRng(5));
    expect(plan.groups.map((g) => g.teamIds.length)).toEqual([5, 4]);

    const group = plan.matches.filter((m) => m.groupKey !== null);
    // Every pair inside a group meets exactly once: C(5,2) + C(4,2).
    expect(group).toHaveLength(10 + 6);
    const pairs = group.map((m) =>
      [(m.sourceA as { teamId: string }).teamId, (m.sourceB as { teamId: string }).teamId].sort().join("|"),
    );
    expect(new Set(pairs).size).toBe(16);

    // The bigger group keeps playing after the smaller one is done, and no
    // team is ever drawn twice in the same round.
    for (const slot of plan.slots) {
      const inSlot = plan.matches.filter((m) => m.slotIndex === slot.index);
      const sides = inSlot.flatMap((m) => [m.sourceA, m.sourceB]).filter((x) => x.kind === "TEAM");
      expect(new Set(sides.map((x) => (x as { teamId: string }).teamId)).size).toBe(sides.length);
    }
    expect(plan.matches.filter((m) => m.groupKey === null)).toHaveLength(3);
  });
});

describe("playoffOptions", () => {
  it("lets 3 groups of 4 feed either quarter- or semi-finals", () => {
    expect(playoffOptions(12, 3)).toEqual([0, 2, 4, 8]);
  });

  it("never asks a group for more teams than it holds", () => {
    // 4 groups of 2: a round of 16 would need 4 from each group of 2.
    expect(playoffOptions(8, 4)).toEqual([0, 2, 4, 8]);
    expect(playoffOptions(8, 2)).toEqual([0, 2, 4, 8]);
  });

  it("offers only the full field when there is no group stage", () => {
    expect(playoffOptions(16, 0)).toEqual([0, 16]);
  });
});

describe("customFormat", () => {
  it("derives top 2 + 2 best 3rds for 3 groups into quarter-finals", () => {
    const f = customFormat({ teamCount: 12, groupCount: 3, playoffSize: 8 });
    expect(f).toMatchObject({ groupSize: 4, advancePerGroup: 2, wildcards: 2 });
    expect(qualifierCount(f, 12)).toBe(8);
    expect(validateFormat(f, 12)).toBeNull();
  });

  it("derives 3 winners + best runner-up for the same groups into semi-finals", () => {
    const f = customFormat({ teamCount: 12, groupCount: 3, playoffSize: 4 });
    expect(f).toMatchObject({ groupSize: 4, advancePerGroup: 1, wildcards: 1 });
    expect(qualifierCount(f, 12)).toBe(4);
    expect(validateFormat(f, 12)).toBeNull();
  });

  it("sends the two best group winners straight to a final", () => {
    const f = customFormat({ teamCount: 12, groupCount: 3, playoffSize: 2 });
    expect(f).toMatchObject({ advancePerGroup: 0, wildcards: 2 });
    expect(validateFormat(f, 12)).toBeNull();
  });

  it("makes a groups-only format when the playoff is off", () => {
    const f = customFormat({ teamCount: 12, groupCount: 3, playoffSize: 0 });
    expect(qualifierCount(f, 12)).toBe(0);
    expect(validateFormat(f, 12)).toBeNull();
  });

  it("describes itself in the organiser's words", () => {
    expect(describeCustom({ teamCount: 12, groupCount: 3, playoffSize: 4 })).toBe(
      "12 teams · 3 groups of 4 · group winners + best runner-up · semi-finals",
    );
    expect(describeCustom({ teamCount: 12, groupCount: 3, playoffSize: 8 })).toBe(
      "12 teams · 3 groups of 4 · top 2 + best 3rds (2) · quarter-finals",
    );
  });
});

describe("every offered combination generates a plan", () => {
  for (const teamCount of [6, 8, 12, 16]) {
    for (const groupCount of groupOptions(teamCount)) {
      for (const playoffSize of playoffOptions(teamCount, groupCount)) {
        it(`${teamCount} teams · ${groupCount} groups · playoff ${playoffSize}`, () => {
          const f = customFormat({ teamCount, groupCount, playoffSize });
          expect(validateFormat(f, teamCount)).toBeNull();
          const plan = generatePlan(f, teams(teamCount), 2, seededRng(7));
          expect(plan.slots.length).toBeGreaterThan(0);
          // Every knockout entrant reaches exactly one first-round position.
          const knockout = plan.matches.filter((m) => m.groupKey === null);
          expect(knockout.length).toBe(playoffSize === 0 ? 0 : playoffSize - 1);
        });
      }
    }
  }
});

describe("playoffLabel", () => {
  it("names the round the organiser would say", () => {
    expect(playoffLabel(8)).toBe("Quarter-finals");
    expect(playoffLabel(4)).toBe("Semi-finals");
    expect(playoffLabel(2)).toBe("Final only");
    expect(playoffLabel(16)).toBe("Round of 16");
  });
});
