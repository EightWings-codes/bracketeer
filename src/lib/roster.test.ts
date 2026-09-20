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
