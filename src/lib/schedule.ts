/**
 * Derived schedule with delay propagation. Nothing here is persisted: the
 * projection is recomputed from slot inputs on every render, so a slot that
 * over-runs pushes everything behind it forward for free.
 */

export interface SlotInput {
  index: number;
  startedAt: Date | null;
  endedAt: Date | null;
  /** override ?? tournament default */
  durationSec: number;
  /** override ?? tournament default */
  breakAfterSec: number;
  plannedStartOverride: Date | null;
}

export type SlotState = "done" | "running" | "upcoming";

export interface SlotProjection {
  index: number;
  /** What the start would have been with no delays (overrides still apply). */
  baselineStart: Date;
  projectedStart: Date;
  projectedEnd: Date;
  /** projectedStart − baselineStart, in whole seconds. */
  delaySec: number;
  state: SlotState;
}

interface Pass {
  start: number;
  end: number;
  state: SlotState;
}

function runPass(
  startsAt: Date,
  slots: SlotInput[],
  now: Date,
  useActuals: boolean,
): Pass[] {
  const nowMs = now.getTime();
  let cursor = startsAt.getTime();
  const out: Pass[] = [];

  for (const s of slots) {
    const durMs = s.durationSec * 1000;
    let start: number;
    let end: number;
    let state: SlotState;

    if (useActuals && s.endedAt) {
      state = "done";
      start = s.startedAt ? s.startedAt.getTime() : cursor;
      end = s.endedAt.getTime();
    } else if (useActuals && s.startedAt) {
      state = "running";
      start = s.startedAt.getTime();
      // A running slot cannot end in the past: this is the live over-run push.
      end = Math.max(start + durMs, nowMs);
    } else {
      state = "upcoming";
      const anchor = s.plannedStartOverride
        ? s.plannedStartOverride.getTime()
        : cursor;
      // Never advertise a start time that is already past.
      start = useActuals ? Math.max(anchor, nowMs) : anchor;
      end = start + durMs;
    }

    // Cursor is monotonic so an out-of-order start can't rewind the clock.
    cursor = Math.max(cursor, end + s.breakAfterSec * 1000);
    out.push({ start, end, state });
  }
  return out;
}

export function projectSchedule(
  startsAt: Date,
  slots: SlotInput[],
  now: Date,
): SlotProjection[] {
  const ordered = [...slots].sort((a, b) => a.index - b.index);
  const baseline = runPass(startsAt, ordered, now, false);
  const actual = runPass(startsAt, ordered, now, true);

  return ordered.map((s, i) => {
    const b = baseline[i]!;
    const a = actual[i]!;
    return {
      index: s.index,
      baselineStart: new Date(b.start),
      projectedStart: new Date(a.start),
      projectedEnd: new Date(a.end),
      delaySec: Math.round((a.start - b.start) / 1000),
      state: a.state,
    };
  });
}

/** Convenience: the largest delay across upcoming/running slots, in seconds. */
export function overallDelaySec(projection: SlotProjection[]): number {
  let max = 0;
  for (const p of projection) {
    if (p.state !== "done") max = Math.max(max, p.delaySec);
  }
  return max;
}
