import { describe, expect, it } from "vitest";
import { roundRobinRounds } from "./roundrobin";

function allPairs(rounds: Array<Array<[number, number]>>) {
  return rounds.flat().map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`));
}

describe("roundRobinRounds", () => {
  it("gives 3 rounds × 2 matches for 4 teams, every pair once", () => {
    const r = roundRobinRounds(4);
    expect(r).toHaveLength(3);
    expect(r.every((round) => round.length === 2)).toBe(true);
    expect(new Set(allPairs(r)).size).toBe(6);
  });

  it("pads an odd count with a bye: 3 teams → 3 rounds of 1 match", () => {
    const r = roundRobinRounds(3);
    expect(r).toHaveLength(3);
    expect(r.every((round) => round.length === 1)).toBe(true);
    expect(new Set(allPairs(r)).size).toBe(3);
  });

  it("never schedules a team twice in one round", () => {
    for (const n of [4, 5, 6, 8]) {
      for (const round of roundRobinRounds(n)) {
        const seen = round.flat();
        expect(new Set(seen).size).toBe(seen.length);
      }
    }
  });

  it("returns nothing for fewer than 2 teams", () => {
    expect(roundRobinRounds(1)).toEqual([]);
  });
});
