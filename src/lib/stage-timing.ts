/**
 * Per-stage clock. A group round and a final rarely want the same length, and
 * the gap between two stages is usually longer than the gap between two rounds
 * of the same stage — teams have to be worked out, tables re-set, people
 * called back.
 *
 * Three layers, narrowest first:
 *   1. the slot's own durationSecOverride / breakAfterSecOverride
 *   2. this stage's entry
 *   3. the tournament-wide gameDurationSec / breakDurationSec
 *
 * Kept as a plain map rather than columns so a stage that isn't in the plan
 * simply isn't in the map, and so nothing has to be regenerated when the
 * organiser moves a number.
 */
import { STAGES, type Stage } from "./bracket";

export interface StageTiming {
  /** Match length for rounds of this stage. */
  gameSec?: number;
  /** Break after a round that is followed by another round of the same stage. */
  breakSec?: number;
  /** Break after this stage's last round, before the next stage starts. */
  breakAfterStageSec?: number;
}

export type StageTimingMap = Partial<Record<Stage, StageTiming>>;

export interface ClockDefaults {
  gameDurationSec: number;
  breakDurationSec: number;
}

const FIELDS = ["gameSec", "breakSec", "breakAfterStageSec"] as const;
const MAX_SEC = 24 * 60 * 60;

const isStage = (s: string): s is Stage => (STAGES as readonly string[]).includes(s);

/** Read the stored JSON defensively — it is user data from an older shape. */
export function parseStageTiming(json: unknown): StageTimingMap {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const out: StageTimingMap = {};
  for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
    if (!isStage(key) || !value || typeof value !== "object") continue;
    const entry: StageTiming = {};
    for (const f of FIELDS) {
      const raw = (value as Record<string, unknown>)[f];
      if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
      const sec = Math.round(raw);
      if (sec < 0 || sec > MAX_SEC) continue;
      entry[f] = sec;
    }
    if (Object.keys(entry).length > 0) out[key] = entry;
  }
  return out;
}

/** Drops empty entries so an all-default map is stored as null, not as noise. */
export function pruneStageTiming(map: StageTimingMap): StageTimingMap | null {
  const out: StageTimingMap = {};
  for (const stage of STAGES) {
    const entry = map[stage];
    if (!entry) continue;
    const kept: StageTiming = {};
    for (const f of FIELDS) if (entry[f] !== undefined) kept[f] = entry[f];
    if (Object.keys(kept).length > 0) out[stage] = kept;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export interface EffectiveTiming {
  gameSec: number;
  breakSec: number;
  breakAfterStageSec: number;
}

/** What a stage actually runs at, with the tournament defaults filled in. */
export function effectiveTiming(
  map: StageTimingMap,
  stage: Stage,
  defaults: ClockDefaults,
): EffectiveTiming {
  const entry = map[stage] ?? {};
  const breakSec = entry.breakSec ?? defaults.breakDurationSec;
  return {
    gameSec: entry.gameSec ?? defaults.gameDurationSec,
    breakSec,
    // An unset stage break is just the ordinary break — no surprise gaps.
    breakAfterStageSec: entry.breakAfterStageSec ?? breakSec,
  };
}

export interface TimedSlot {
  index: number;
  stage: Stage;
}

export interface SlotTiming {
  durationSec: number;
  breakAfterSec: number;
}

/**
 * Duration and following break for every slot, before per-slot overrides.
 *
 * A slot counts as a stage boundary when the next slot has a different stage,
 * which is where the longer between-stages break belongs. In double
 * elimination the winners and losers rounds interleave, so most slots are
 * boundaries — set that stage's two breaks to the same number and it behaves
 * exactly as before.
 */
export function slotTimings(
  slots: TimedSlot[],
  map: StageTimingMap,
  defaults: ClockDefaults,
): Map<number, SlotTiming> {
  const ordered = [...slots].sort((a, b) => a.index - b.index);
  const out = new Map<number, SlotTiming>();
  ordered.forEach((s, i) => {
    const t = effectiveTiming(map, s.stage, defaults);
    const next = ordered[i + 1];
    const boundary = next !== undefined && next.stage !== s.stage;
    out.set(s.index, {
      durationSec: t.gameSec,
      breakAfterSec: boundary ? t.breakAfterStageSec : t.breakSec,
    });
  });
  return out;
}

/** Minutes a plan takes end to end, breaks between rounds included. */
export function planDurationSec(
  slots: TimedSlot[],
  map: StageTimingMap,
  defaults: ClockDefaults,
): number {
  const timings = slotTimings(slots, map, defaults);
  const ordered = [...slots].sort((a, b) => a.index - b.index);
  return ordered.reduce((sec, s, i) => {
    const t = timings.get(s.index)!;
    // The break after the last round is not part of the day.
    return sec + t.durationSec + (i === ordered.length - 1 ? 0 : t.breakAfterSec);
  }, 0);
}

/** The stages a plan touches, in playing order — what the timing editor lists. */
export function stagesInOrder(slots: TimedSlot[]): Stage[] {
  const seen: Stage[] = [];
  for (const s of [...slots].sort((a, b) => a.index - b.index)) {
    if (!seen.includes(s.stage)) seen.push(s.stage);
  }
  return seen;
}
