import { describe, expect, it } from "vitest";
import { projectSchedule, roundClock, type SlotInput } from "./schedule";

const T0 = new Date("2026-09-13T18:00:00Z");
const min = (n: number) => new Date(T0.getTime() + n * 60_000);

function slot(index: number, over: Partial<SlotInput> = {}): SlotInput {
  return {
    index,
    startedAt: null,
    endedAt: null,
    durationSec: 20 * 60,
    breakAfterSec: 5 * 60,
    plannedStartOverride: null,
    ...over,
  };
}

describe("projectSchedule", () => {
  it("handles an empty list", () => {
    expect(projectSchedule(T0, [], T0)).toEqual([]);
  });

  it("has zero delay everywhere when nothing has started and now < startsAt", () => {
    const p = projectSchedule(T0, [slot(0), slot(1), slot(2)], min(-30));
    expect(p.map((s) => s.delaySec)).toEqual([0, 0, 0]);
    expect(p.map((s) => s.projectedStart)).toEqual([min(0), min(25), min(50)]);
    expect(p.every((s) => s.state === "upcoming")).toBe(true);
  });

  it("drifts by exactly now − startsAt when nothing has started and now > startsAt", () => {
    const p = projectSchedule(T0, [slot(0), slot(1)], min(7));
    expect(p.map((s) => s.delaySec)).toEqual([7 * 60, 7 * 60]);
    expect(p[0]!.projectedStart).toEqual(min(7));
  });

  it("marks everything done when all slots ended", () => {
    const p = projectSchedule(
      T0,
      [
        slot(0, { startedAt: min(0), endedAt: min(20) }),
        slot(1, { startedAt: min(25), endedAt: min(45) }),
      ],
      min(60),
    );
    expect(p.map((s) => s.state)).toEqual(["done", "done"]);
    expect(p[1]!.projectedEnd).toEqual(min(45));
  });

  it("pushes later slots when a running slot over-runs", () => {
    // Slot 0 started on time, planned to end 18:20, but it is now 18:30.
    const p = projectSchedule(T0, [slot(0, { startedAt: min(0) }), slot(1), slot(2)], min(30));
    expect(p[0]!.state).toBe("running");
    expect(p[0]!.projectedEnd).toEqual(min(30));
    expect(p[1]!.projectedStart).toEqual(min(35));
    expect(p[1]!.delaySec).toBe(10 * 60);
    expect(p[2]!.delaySec).toBe(10 * 60);
  });

  it("pulls later slots earlier when a round finishes early", () => {
    const p = projectSchedule(
      T0,
      [slot(0, { startedAt: min(0), endedAt: min(12) }), slot(1)],
      min(12),
    );
    expect(p[1]!.projectedStart).toEqual(min(17));
    expect(p[1]!.delaySec).toBe(-8 * 60);
  });

  it("treats endedAt with a null startedAt as done at the cursor", () => {
    const p = projectSchedule(T0, [slot(0, { endedAt: min(15) }), slot(1)], min(15));
    expect(p[0]!.state).toBe("done");
    expect(p[0]!.projectedStart).toEqual(min(0));
    expect(p[1]!.projectedStart).toEqual(min(20));
  });

  it("re-anchors on a pinned planned start mid-list", () => {
    const p = projectSchedule(
      T0,
      [slot(0), slot(1, { plannedStartOverride: min(60) }), slot(2)],
      min(-5),
    );
    expect(p[1]!.projectedStart).toEqual(min(60));
    expect(p[1]!.delaySec).toBe(0); // the pin is an input to the baseline too
    expect(p[2]!.projectedStart).toEqual(min(85));
  });

  it("never rewinds the clock when slot 3 starts while slot 2 still runs", () => {
    const p = projectSchedule(
      T0,
      [
        slot(0, { startedAt: min(0), endedAt: min(20) }),
        slot(1, { startedAt: min(25) }), // running, planned end 18:45
        slot(2, { startedAt: min(30) }), // started early, planned end 18:50
        slot(3),
      ],
      min(40),
    );
    expect(p[1]!.state).toBe("running");
    expect(p[2]!.state).toBe("running");
    // Slot 3 waits for the later of the two running ends + break.
    expect(p[3]!.projectedStart).toEqual(min(55));
  });

  it("works with a zero break", () => {
    const p = projectSchedule(T0, [slot(0, { breakAfterSec: 0 }), slot(1)], min(-1));
    expect(p[1]!.projectedStart).toEqual(min(20));
  });

  it("keeps delay at 0 when a duration override changes baseline and projection alike", () => {
    const p = projectSchedule(T0, [slot(0, { durationSec: 40 * 60 }), slot(1)], min(-1));
    expect(p[1]!.projectedStart).toEqual(min(45));
    expect(p[1]!.delaySec).toBe(0);
  });
});

describe("roundClock", () => {
  it("counts to the tournament start before anything has started", () => {
    expect(roundClock(T0, [slot(0), slot(1)])).toEqual({ phase: "prestart", nextIndex: 0, endsAt: T0 });
  });

  it("counts a running round down from its own start, not the plan", () => {
    // Started seven minutes late: the game still gets its full twenty.
    const c = roundClock(T0, [slot(0, { startedAt: min(7) }), slot(1)]);
    expect(c).toEqual({ phase: "game", index: 0, endsAt: min(27) });
  });

  it("does not drift while a round over-runs", () => {
    const c = roundClock(T0, [slot(0, { startedAt: T0 }), slot(1)]);
    expect(c.phase === "game" && c.endsAt).toEqual(min(20));
  });

  it("counts the break from the moment the round was stopped", () => {
    const c = roundClock(T0, [slot(0, { startedAt: T0, endedAt: min(23) }), slot(1)]);
    expect(c).toEqual({ phase: "break", afterIndex: 0, nextIndex: 1, endsAt: min(28) });
  });

  it("uses the stopped round's own break length", () => {
    const c = roundClock(T0, [slot(0, { startedAt: T0, endedAt: min(20), breakAfterSec: 15 * 60 }), slot(1)]);
    expect(c.phase === "break" && c.endsAt).toEqual(min(35));
  });

  it("waits for a pinned start that is later than the break", () => {
    const c = roundClock(T0, [slot(0, { startedAt: T0, endedAt: min(20) }), slot(1, { plannedStartOverride: min(60) })]);
    expect(c.phase === "break" && c.endsAt).toEqual(min(60));
  });

  it("is idle once every round has been played", () => {
    expect(roundClock(T0, [slot(0, { startedAt: T0, endedAt: min(20) })])).toEqual({ phase: "idle" });
  });
});
