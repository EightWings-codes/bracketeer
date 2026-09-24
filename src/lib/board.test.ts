import { describe, expect, it } from "vitest";
import {
  availableViews,
  DEFAULT_LOOK,
  fitClass,
  parseBoardConfig,
  podium,
  scheduleRows,
  standingsKind,
  type BoardConfig,
  type PodiumMatch,
  type ScheduleSlot,
} from "./board";
import { projectSchedule, type SlotInput } from "./schedule";

const cfg = (sp: Record<string, string> = {}, status = "RUNNING", hasVenueImage = false) =>
  parseBoardConfig(sp, { status, hasVenueImage });

describe("parseBoardConfig", () => {
  it("cycles by default once the tournament is under way", () => {
    expect(cfg().mode).toBe("cycle");
  });

  it("holds the games view through draft and registration", () => {
    for (const status of ["DRAFT", "REGISTRATION"]) {
      const c = cfg({}, status);
      expect(c.mode).toBe("pinned");
      expect(c.pinned).toBe("games");
    }
    expect(cfg({}, "LOCKED").mode).toBe("cycle");
  });

  it("lets an explicit pin win before the start", () => {
    const c = cfg({ view: "schedule" }, "REGISTRATION");
    expect(c.mode).toBe("pinned");
    expect(c.pinned).toBe("schedule");
  });

  it("reads the combined board", () => {
    expect(cfg({ view: "all" }).mode).toBe("all");
  });

  it("falls back to cycling on an unknown view", () => {
    expect(cfg({ view: "podium" }).mode).toBe("cycle");
  });

  it("defaults every dwell to ten seconds", () => {
    expect(cfg().dwellMs).toEqual({ games: 10_000, standings: 10_000, schedule: 10_000 });
  });

  it("takes one dwell for all three", () => {
    expect(cfg({ dwell: "15" }).dwellMs.standings).toBe(15_000);
  });

  it("takes a dwell per view and leaves the rest alone", () => {
    const d = cfg({ dwell: "games:15,schedule:8" }).dwellMs;
    expect(d).toEqual({ games: 15_000, standings: 10_000, schedule: 8_000 });
  });

  it("takes zero as skip-this-view", () => {
    expect(cfg({ dwell: "standings:0" }).dwellMs).toEqual({ games: 10_000, standings: 0, schedule: 10_000 });
  });

  it("ignores nonsense in the dwell rather than blanking the screen", () => {
    expect(cfg({ dwell: "games:soon,:,,standings:-4" }).dwellMs).toEqual({
      games: 10_000,
      standings: 10_000,
      schedule: 10_000,
    });
  });

  it("reads the spellings someone types by hand", () => {
    expect(cfg({ qr: "off" }).qr).toBe(false);
    expect(cfg({ qr: "0" }).qr).toBe(false);
    expect(cfg({ timer: "no" }).timer).toBe(false);
    expect(cfg({ band: "maybe" }).band).toBe(true);
  });

  it("shows the map only when there is one, unless told otherwise", () => {
    expect(cfg().map).toBe(false);
    expect(cfg({}, "RUNNING", true).map).toBe(true);
    expect(cfg({ map: "off" }, "RUNNING", true).map).toBe(false);
  });

  it("clamps the type scale and the safe area", () => {
    expect(cfg({ scale: "3" }).scale).toBe(1.4);
    expect(cfg({ scale: "0.1" }).scale).toBe(0.8);
    expect(cfg({ scale: "huge" }).scale).toBe(1);
    expect(cfg({ inset: "9" }).inset).toBe(5);
  });

  it("picks a look, and keeps the old contrast flag working", () => {
    expect(cfg().look).toBe(DEFAULT_LOOK.id);
    expect(cfg({ look: "dusk" }).look).toBe("dusk");
    expect(cfg({ look: "DAYLIGHT" }).look).toBe("daylight");
    expect(cfg({ contrast: "high" }).look).toBe("contrast");
    // An explicit look wins over the flag it replaced.
    expect(cfg({ look: "paper", contrast: "high" }).look).toBe("paper");
    expect(cfg({ look: "chartreuse" }).look).toBe(DEFAULT_LOOK.id);
  });

  it("caps the free-text line", () => {
    expect(cfg({ msg: "x".repeat(400) }).msg).toHaveLength(120);
    expect(cfg().msg).toBeNull();
  });
});

describe("availableViews", () => {
  const all = { groups: true, knockout: true, slots: true };

  it("offers all three once everything exists", () => {
    expect(availableViews(cfg(), all)).toEqual(["games", "standings", "schedule"]);
  });

  it("skips views with nothing to say", () => {
    expect(availableViews(cfg(), { groups: false, knockout: false, slots: true })).toEqual(["games", "schedule"]);
    expect(availableViews(cfg(), { groups: false, knockout: false, slots: false })).toEqual(["games"]);
  });

  it("returns just the pinned view", () => {
    expect(availableViews(cfg({ view: "schedule" }), all)).toEqual(["schedule"]);
  });

  it("drops a view given zero seconds", () => {
    expect(availableViews(cfg({ dwell: "standings:0" }), all)).toEqual(["games", "schedule"]);
    expect(availableViews(cfg({ dwell: "games:0,schedule:0" }), all)).toEqual(["standings"]);
  });

  it("ignores the zeros when every view is skipped", () => {
    expect(availableViews(cfg({ dwell: "0" }), all)).toEqual(["games", "standings", "schedule"]);
  });

  it("still drops a view that has nothing to say, whatever its dwell", () => {
    expect(availableViews(cfg({ dwell: "30" }), { groups: false, knockout: false, slots: true })).toEqual([
      "games",
      "schedule",
    ]);
  });
});

describe("standingsKind", () => {
  const both = { hasGroups: true, hasKnockout: true };

  it("follows the running round", () => {
    expect(standingsKind(cfg(), { stage: "GROUP", ...both })).toBe("groups");
    expect(standingsKind(cfg(), { stage: "SEMI", ...both })).toBe("bracket");
    expect(standingsKind(cfg(), { stage: "GRAND_FINAL", ...both })).toBe("bracket");
  });

  it("obeys a manual pin", () => {
    expect(standingsKind(cfg({ standings: "bracket" }), { stage: "GROUP", ...both })).toBe("bracket");
    expect(standingsKind(cfg({ standings: "groups" }), { stage: "FINAL", ...both })).toBe("groups");
  });

  it("falls back to the roster when a pin has nothing behind it", () => {
    expect(standingsKind(cfg({ standings: "bracket" }), { stage: "GROUP", hasGroups: true, hasKnockout: false })).toBe(
      "roster",
    );
    expect(standingsKind(cfg(), { stage: null, hasGroups: false, hasKnockout: false })).toBe("roster");
  });

  it("shows whatever exists before a round is running", () => {
    expect(standingsKind(cfg(), { stage: null, hasGroups: true, hasKnockout: true })).toBe("groups");
    expect(standingsKind(cfg(), { stage: null, hasGroups: false, hasKnockout: true })).toBe("bracket");
  });
});

describe("scheduleRows", () => {
  const T0 = new Date("2026-09-13T18:00:00Z");
  const input = (index: number, over: Partial<SlotInput> = {}): SlotInput => ({
    index,
    startedAt: null,
    endedAt: null,
    durationSec: 10 * 60,
    breakAfterSec: 5 * 60,
    plannedStartOverride: null,
    ...over,
  });

  const rows = (now: Date, inputs: SlotInput[], manualRounds = false) => {
    const p = projectSchedule(T0, inputs, now);
    const slots: ScheduleSlot[] = inputs.map((s, i) => ({
      id: `s${i}`,
      label: `Round ${i + 1}`,
      index: s.index,
      projection: p[i]!,
    }));
    return scheduleRows(slots, () => 2, { manualRounds });
  };

  it("prints starts with the break included", () => {
    // Round one started at 18:00 and is six minutes in, so it ends at 18:10;
    // the next starts after the five-minute break, and so on.
    const out = rows(new Date("2026-09-13T18:06:00Z"), [
      input(0, { startedAt: T0 }),
      input(1),
      input(2),
    ]);
    expect(out.map((r) => r.startIso)).toEqual([
      "2026-09-13T18:00:00.000Z",
      "2026-09-13T18:15:00.000Z",
      "2026-09-13T18:30:00.000Z",
    ]);
    expect(out[0]!.endIso).toBe("2026-09-13T18:10:00.000Z");
    expect(out[1]!.endIso).toBeNull();
  });

  it("pushes the later rounds when one over-runs", () => {
    // Same round, but it is now 18:14 and nobody has stopped it.
    const out = rows(new Date("2026-09-13T18:14:00Z"), [input(0, { startedAt: T0 }), input(1)]);
    expect(out[1]!.startIso).toBe("2026-09-13T18:19:00.000Z");
    expect(out[1]!.delaySec).toBe(4 * 60);
  });

  it("drops rounds that are already played once something is live", () => {
    const out = rows(new Date("2026-09-13T18:20:00Z"), [
      input(0, { startedAt: T0, endedAt: new Date("2026-09-13T18:10:00Z") }),
      input(1, { startedAt: new Date("2026-09-13T18:15:00Z") }),
      input(2),
    ]);
    expect(out.map((r) => r.label)).toEqual(["Round 2", "Round 3"]);
    expect(out[0]!.state).toBe("running");
  });

  it("keeps every round while none has started", () => {
    expect(rows(new Date("2026-09-13T17:00:00Z"), [input(0), input(1)])).toHaveLength(2);
  });

  it("keeps projected times but drops the delay under manual rounds", () => {
    const out = rows(new Date("2026-09-13T18:14:00Z"), [input(0, { startedAt: T0 }), input(1)], true);
    expect(out[1]!.startIso).toBe("2026-09-13T18:19:00.000Z");
    expect(out.every((r) => r.delaySec === 0)).toBe(true);
    expect(out.map((r) => r.number)).toEqual([1, 2]);
  });
});

describe("podium", () => {
  const m = (over: Partial<PodiumMatch> = {}): PodiumMatch => ({
    stage: "FINAL",
    status: "CONFIRMED",
    sourceAKind: "WINNER",
    labelA: "Hopfen",
    labelB: "Malz",
    scoreA: 5,
    scoreB: 3,
    ...over,
  });

  it("reads the final", () => {
    expect(podium([m()])).toEqual({ champion: "Hopfen", runnerUp: "Malz", score: "5:3", third: null });
  });

  it("takes the winner whichever side it is", () => {
    expect(podium([m({ scoreA: 2, scoreB: 7 })])?.champion).toBe("Malz");
  });

  it("prefers the grand final in a double elimination", () => {
    const out = podium([
      m({ labelA: "Hopfen", labelB: "Malz" }),
      m({ stage: "GRAND_FINAL", labelA: "Gerste", labelB: "Sudhaus", scoreA: 4, scoreB: 6 }),
    ]);
    expect(out?.champion).toBe("Sudhaus");
  });

  it("finds third place in its own slot", () => {
    const out = podium([m(), m({ stage: "THIRD", labelA: "Gerste", labelB: "Sudhaus", scoreA: 5, scoreB: 1 })]);
    expect(out?.third).toBe("Gerste");
  });

  it("finds third place when it shares the final's slot", () => {
    const out = podium([
      m(),
      m({ sourceAKind: "LOSER", labelA: "Gerste", labelB: "Sudhaus", scoreA: 1, scoreB: 5 }),
    ]);
    expect(out?.champion).toBe("Hopfen");
    expect(out?.third).toBe("Sudhaus");
  });

  it("stays quiet until the decider is confirmed", () => {
    expect(podium([m({ status: "REPORTED" })])).toBeNull();
    expect(podium([m({ scoreA: null, scoreB: null })])).toBeNull();
    expect(podium([])).toBeNull();
  });

  it("refuses to crown anyone on a drawn final", () => {
    expect(podium([m({ scoreA: 4, scoreB: 4 })])).toBeNull();
  });
});

describe("fitClass", () => {
  const steps = ["a", "b", "c"] as const;

  it("keeps the top size for short names", () => {
    expect(fitClass(["Malz", "Hopfen"], steps, 10)).toBe("a");
  });

  it("steps down for the longest name in the set", () => {
    expect(fitClass(["Malz", "Schützengarten Brauerei"], steps, 10)).toBe("c");
  });

  it("handles an empty set", () => {
    expect(fitClass([], steps, 10)).toBe("a");
  });
});
