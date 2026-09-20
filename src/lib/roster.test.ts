import { describe, expect, it } from "vitest";
import { describeSize, isSolo, normaliseMembers, rosterProblem, sizeBoundsProblem, unit } from "./roster";

const rules = (min: number, max: number) => ({ minTeamSize: min, maxTeamSize: max });

describe("roster rules", () => {
  it("treats a max of one as a singles tournament", () => {
    expect(isSolo(rules(1, 1))).toBe(true);
    expect(unit(rules(1, 1))).toBe("Player");
    expect(unit(rules(2, 4), true)).toBe("Teams");
    expect(describeSize(rules(1, 1))).toBe("one player");
    expect(describeSize(rules(2, 2))).toBe("exactly 2 players");
    expect(describeSize(rules(2, 4))).toBe("2–4 players");
    expect(describeSize(rules(1, 8))).toBe("up to 8 players");
  });

  it("accepts a roster inside the bounds and rejects one outside", () => {
    expect(rosterProblem(rules(2, 4), ["a", "b"])).toBeNull();
    expect(rosterProblem(rules(2, 4), ["a", "b", "c", "d"])).toBeNull();
    expect(rosterProblem(rules(2, 4), ["a"])).toMatch(/needs 2–4 players/);
    expect(rosterProblem(rules(2, 4), ["a", "b", "c", "d", "e"])).toMatch(/At most 4/);
  });

  it("never asks a singles entrant for a roster", () => {
    expect(rosterProblem(rules(1, 1), [])).toBeNull();
    // The entrant's own name is the roster, so standings still have a person.
    expect(normaliseMembers(rules(1, 1), "Jan", [])).toEqual(["Jan"]);
    expect(normaliseMembers(rules(1, 4), "Sharks", ["a", "b"])).toEqual(["a", "b"]);
    expect(normaliseMembers(rules(1, 2), "Sharks", ["a", "b", "c"])).toEqual(["a", "b"]);
  });

  it("refuses bounds that would lock registration out", () => {
    expect(sizeBoundsProblem(1, 8)).toBeNull();
    expect(sizeBoundsProblem(1, 1)).toBeNull();
    expect(sizeBoundsProblem(4, 2)).toMatch(/cannot exceed/);
    expect(sizeBoundsProblem(0, 4)).toMatch(/at least 1/);
    expect(sizeBoundsProblem(1, 99)).toMatch(/Maximum team size is 20/);
    expect(sizeBoundsProblem(1.5, 4)).toMatch(/whole numbers/);
  });
});

// Regression: a CONFIRMED match with a blank score reads as settled but is
// skipped by both the standings and bracket resolution, so a knockout stalls
// with nothing to show for it. Seen in production on 2026-09-20.
describe("confirmed matches always carry a result", () => {
  const confirmable = (scoreA: number | null, scoreB: number | null, teamAId: string | null, teamBId: string | null) => {
    if (!teamAId || !teamBId) return "A confirmed match needs both teams.";
    const whole = (n: number | null) => Number.isInteger(n) && (n as number) >= 0;
    if (!whole(scoreA) || !whole(scoreB)) return "A confirmed match needs both scores as whole numbers ≥ 0.";
    return null;
  };

  it("rejects the shapes that silently stall a bracket", () => {
    expect(confirmable(1, null, "a", "b")).toMatch(/both scores/);
    expect(confirmable(null, null, "a", "b")).toMatch(/both scores/);
    expect(confirmable(1, 0, null, "b")).toMatch(/both teams/);
    expect(confirmable(-1, 0, "a", "b")).toMatch(/both scores/);
    expect(confirmable(1, 0, "a", "b")).toBeNull();
    expect(confirmable(0, 0, "a", "b")).toBeNull();
  });
});
