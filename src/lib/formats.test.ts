import { describe, expect, it } from "vitest";
import {
  customFormat,
  describeCustom,
  groupOptions,
  playoffLabel,
  playoffOptions,
  qualifierCount,
  validateFormat,
} from "@/lib/formats";
import { generatePlan } from "@/lib/bracket";
import { seededRng } from "@/lib/rng";

const teams = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, name: `Team ${i + 1}`, seed: null }));

describe("groupOptions", () => {
  it("offers only layouts that divide the field evenly", () => {
    expect(groupOptions(12)).toEqual([1, 2, 3, 4, 6]);
    expect(groupOptions(7)).toEqual([1]);
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
