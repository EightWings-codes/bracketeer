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

/**
 * The one timer manual rounds show. Nothing here moves a round — the organiser
 * still starts and stops each one — it only says what the room is waiting on:
 *
 *   game      a round is running: counts to its start + game length
 *   break     the last round was stopped: counts to its stop + break length
 *   prestart  nothing has started yet: counts to the tournament start
 *   idle      every round has been played
 *
 * The target is fixed once it is set — it never drifts with the wall clock the
 * way a projection does — so the display can stop at zero and wait there.
 */
export type RoundClock =
  | { phase: "game"; index: number; endsAt: Date }
  | { phase: "break"; afterIndex: number; nextIndex: number; endsAt: Date }
  | { phase: "prestart"; nextIndex: number; endsAt: Date }
  | { phase: "idle" };

export function roundClock(startsAt: Date, slots: SlotInput[]): RoundClock {
  const ordered = [...slots].sort((a, b) => a.index - b.index);

  const running = ordered.find((s) => s.startedAt && !s.endedAt);
  if (running) {
    return {
      phase: "game",
      index: running.index,
      endsAt: new Date(running.startedAt!.getTime() + running.durationSec * 1000),
    };
  }

  const next = ordered.find((s) => !s.startedAt);
  if (!next) return { phase: "idle" };
  const pinned = next.plannedStartOverride?.getTime() ?? 0;

  // The break belongs to whichever round was stopped last, not the one with
  // the highest number — rounds can be run out of order.
  let last: SlotInput | null = null;
  for (const s of ordered) {
    if (s.endedAt && (!last || s.endedAt.getTime() >= last.endedAt!.getTime())) last = s;
  }
  if (!last) {
    return { phase: "prestart", nextIndex: next.index, endsAt: new Date(Math.max(startsAt.getTime(), pinned)) };
  }
  return {
    phase: "break",
    afterIndex: last.index,
    nextIndex: next.index,
    endsAt: new Date(Math.max(last.endedAt!.getTime() + last.breakAfterSec * 1000, pinned)),
  };
}
