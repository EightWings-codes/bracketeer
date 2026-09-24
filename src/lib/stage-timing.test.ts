import { describe, expect, it } from "vitest";
import {
  effectiveTiming,
  parseStageTiming,
  planDurationSec,
  pruneStageTiming,
  slotTimings,
  stagesInOrder,
  type StageTimingMap,
} from "@/lib/stage-timing";
import type { Stage } from "@/lib/bracket";

const defaults = { gameDurationSec: 1200, breakDurationSec: 300 };

const plan = (...stages: Stage[]) => stages.map((stage, index) => ({ index, stage }));

describe("parseStageTiming", () => {
  it("keeps known stages and numeric fields", () => {
    expect(parseStageTiming({ GROUP: { gameSec: 600, breakSec: 120 } })).toEqual({
      GROUP: { gameSec: 600, breakSec: 120 },
    });
  });

  it("drops junk rather than throwing", () => {
    expect(parseStageTiming(null)).toEqual({});
    expect(parseStageTiming([1, 2])).toEqual({});
    expect(parseStageTiming({ NOPE: { gameSec: 600 } })).toEqual({});
    expect(parseStageTiming({ FINAL: { gameSec: "20" } })).toEqual({});
    expect(parseStageTiming({ FINAL: { gameSec: -60 } })).toEqual({});
  });
});

describe("pruneStageTiming", () => {
  it("returns null when nothing is set", () => {
    expect(pruneStageTiming({ GROUP: {}, FINAL: {} })).toBeNull();
  });

  it("keeps only the fields that carry a value", () => {
    expect(pruneStageTiming({ GROUP: { gameSec: 600, breakSec: undefined } })).toEqual({
      GROUP: { gameSec: 600 },
    });
  });
});

describe("effectiveTiming", () => {
  it("falls back to the tournament clock", () => {
    expect(effectiveTiming({}, "GROUP", defaults)).toEqual({
      gameSec: 1200,
      breakSec: 300,
      breakAfterStageSec: 300,
    });
  });

  it("lets a stage break inherit the stage's own round break", () => {
    const map: StageTimingMap = { GROUP: { breakSec: 60 } };
    expect(effectiveTiming(map, "GROUP", defaults).breakAfterStageSec).toBe(60);
  });

  it("uses the between-stages break when it is set", () => {
    const map: StageTimingMap = { GROUP: { breakSec: 60, breakAfterStageSec: 900 } };
    expect(effectiveTiming(map, "GROUP", defaults)).toEqual({
      gameSec: 1200,
      breakSec: 60,
      breakAfterStageSec: 900,
    });
  });
});

describe("slotTimings", () => {
  const slots = plan("GROUP", "GROUP", "GROUP", "SEMI", "FINAL");
  const map: StageTimingMap = {
    GROUP: { gameSec: 600, breakSec: 120, breakAfterStageSec: 1800 },
    SEMI: { gameSec: 1500, breakAfterStageSec: 900 },
    FINAL: { gameSec: 1800 },
  };

  it("uses the long break only at a stage boundary", () => {
    const t = slotTimings(slots, map, defaults);
    expect(t.get(0)).toEqual({ durationSec: 600, breakAfterSec: 120 });
    expect(t.get(1)).toEqual({ durationSec: 600, breakAfterSec: 120 });
    expect(t.get(2)).toEqual({ durationSec: 600, breakAfterSec: 1800 });
    expect(t.get(3)).toEqual({ durationSec: 1500, breakAfterSec: 900 });
  });

  it("gives the last slot its stage break, which the day never spends", () => {
    const t = slotTimings(slots, map, defaults);
    expect(t.get(4)!.durationSec).toBe(1800);
    expect(planDurationSec(slots, map, defaults)).toBe(
      600 * 3 + 120 * 2 + 1800 + 1500 + 900 + 1800,
    );
  });

  it("matches the flat clock when no stage is configured", () => {
    expect(planDurationSec(slots, {}, defaults)).toBe(5 * 1200 + 4 * 300);
  });

  it("survives slots arriving out of order", () => {
    const shuffled = [...slots].reverse();
    expect(slotTimings(shuffled, map, defaults).get(2)!.breakAfterSec).toBe(1800);
  });
});

describe("stagesInOrder", () => {
  it("lists each stage once, in playing order", () => {
    expect(stagesInOrder(plan("GROUP", "GROUP", "QUARTER", "SEMI", "THIRD", "FINAL"))).toEqual([
      "GROUP",
      "QUARTER",
      "SEMI",
      "THIRD",
      "FINAL",
    ]);
  });

  it("does not repeat an interleaved stage", () => {
    expect(stagesInOrder(plan("R16", "LOSERS", "QUARTER", "LOSERS", "SEMI"))).toEqual([
      "R16",
      "LOSERS",
      "QUARTER",
      "SEMI",
    ]);
  });
});
