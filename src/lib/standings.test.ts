import { describe, expect, it } from "vitest";
import { computeStandings, type ConfirmedMatch } from "./standings";

const rules = { pointsWin: 3, pointsDraw: 1, pointsLoss: 0 };
const T = ["a", "b", "c", "d"].map((id) => ({ id, name: id.toUpperCase() }));
const m = (a: string, b: string, sa: number, sb: number): ConfirmedMatch => ({
  teamAId: a,
  teamBId: b,
  scoreA: sa,
  scoreB: sb,
});

describe("computeStandings", () => {
  it("orders by points and tallies rows", () => {
    const s = computeStandings(T, [m("a", "b", 10, 5), m("c", "d", 3, 3)], rules);
    expect(s.map((r) => r.id)).toEqual(["a", "c", "d", "b"]);
    const a = s[0]!;
    expect(a).toMatchObject({ played: 1, won: 1, points: 3, diff: 5, rank: 1 });
    expect(s[1]!.rank).toBe(2);
    expect(s[2]!.rank).toBe(2); // C and D truly tied
    expect(s[2]!.position).toBe(3); // but positions are strict
  });

  it("breaks a two-way points tie by head-to-head before diff", () => {
    // A and B both beat C and D; B beat A narrowly, A has the bigger diff.
    const s = computeStandings(
      T,
      [
        m("a", "c", 10, 0),
        m("a", "d", 10, 0),
        m("b", "c", 5, 4),
        m("b", "d", 5, 4),
        m("b", "a", 6, 5),
        m("c", "d", 1, 0),
      ],
      rules,
    );
    expect(s.map((r) => r.id)).toEqual(["b", "a", "c", "d"]);
  });

  it("recurses on a three-way tie only while the subset shrinks", () => {
    // a, b, c each 6 pts; d 0. Within the trio: a beat b, b beat c, c beat a
    // (circular) → head-to-head is a full tie → fall through to diff.
    const s = computeStandings(
      T,
      [
        m("a", "b", 2, 1),
        m("b", "c", 2, 1),
        m("c", "a", 2, 1),
        m("a", "d", 10, 0),
        m("b", "d", 5, 0),
        m("c", "d", 1, 0),
      ],
      rules,
    );
    expect(s.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
    expect(s.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it("shares a rank on a genuine full tie", () => {
    const s = computeStandings(T.slice(0, 2), [m("a", "b", 1, 1)], rules);
    expect(s.map((r) => r.rank)).toEqual([1, 1]);
    expect(s.map((r) => r.id)).toEqual(["a", "b"]); // name order
  });
});
