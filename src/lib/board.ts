/**
 * Projector board — configuration and derivations. Pure: everything here is a
 * function of the query string plus the loaded view, so the board's behaviour
 * can be tested without a browser or a database.
 *
 * See docs/projector-board.md for the agreed specification.
 */
import type { SlotProjection } from "./schedule";

export const BOARD_VIEWS = ["games", "standings", "schedule"] as const;
export type BoardViewId = (typeof BOARD_VIEWS)[number];

export type StandingsKind = "groups" | "bracket" | "roster";

export interface BoardLook {
  id: string;
  label: string;
  blurb: string;
  /** Whether the palette is dark-on-light or light-on-dark. */
  scheme: "dark" | "light";
  /** Background and accent, for the swatch in the settings panel. */
  swatch: [string, string];
}

/**
 * What the board looks like. Each entry is a block of custom properties in
 * globals.css under `[data-look="…"]`; nothing here but the label and the two
 * colours the settings panel draws a swatch from, so adding a look is one CSS
 * block and one row.
 *
 * A projector in a dark hall wants a dark board, but a TV in a bright room or
 * a bar at four in the afternoon does not — hence the light ones.
 */
export const BOARD_LOOKS: BoardLook[] = [
  { id: "midnight", label: "Midnight", blurb: "Near-black, green accent", scheme: "dark", swatch: ["#07070b", "#34d399"] },
  { id: "slate", label: "Slate", blurb: "Cool blue-grey, softer than black", scheme: "dark", swatch: ["#0f172a", "#38bdf8"] },
  { id: "dusk", label: "Dusk", blurb: "Deep violet with a pink accent", scheme: "dark", swatch: ["#1a1033", "#f472b6"] },
  { id: "forest", label: "Forest", blurb: "Dark green, lime accent", scheme: "dark", swatch: ["#06231a", "#a3e635"] },
  { id: "ember", label: "Ember", blurb: "Warm brown, orange accent", scheme: "dark", swatch: ["#1c0f0a", "#fb923c"] },
  { id: "paper", label: "Paper", blurb: "Warm off-white, ink on the page", scheme: "light", swatch: ["#faf7f0", "#047857"] },
  { id: "daylight", label: "Daylight", blurb: "Bright white — for a lit room", scheme: "light", swatch: ["#ffffff", "#0284c7"] },
  { id: "contrast", label: "High contrast", blurb: "Pure black and white — weak beamer", scheme: "dark", swatch: ["#000000", "#4ade80"] },
];

export const DEFAULT_LOOK = BOARD_LOOKS[0]!;

export function findLook(id: string | null | undefined): BoardLook {
  return BOARD_LOOKS.find((l) => l.id === id) ?? DEFAULT_LOOK;
}

export interface BoardConfig {
  /** `cycle` rotates, `pinned` holds one view, `all` is the combined board. */
  mode: "cycle" | "pinned" | "all";
  /** Which view is held, when mode is `pinned`. */
  pinned: BoardViewId;
  /** Per-view dwell in milliseconds. */
  dwellMs: Record<BoardViewId, number>;
  timer: boolean;
  qr: boolean;
  map: boolean;
  band: boolean;
  standings: "auto" | "groups" | "bracket";
  /** A BoardLook id. */
  look: string;
  /** Type scale multiplier, applied through the --bs custom property. */
  scale: number;
  /** Safe-area padding in %, for beamers that crop the edges. */
  inset: number;
  msg: string | null;
}

export const DEFAULT_DWELL_SEC = 10;

/** Nothing has happened yet in these — the board is a poster, and holds still. */
const PRE_START: readonly string[] = ["DRAFT", "REGISTRATION"];

export type SearchParams = Record<string, string | string[] | undefined>;

const one = (sp: SearchParams, k: string): string | undefined => {
  const v = sp[k];
  const s = Array.isArray(v) ? v[0] : v;
  return s === undefined ? undefined : s.trim();
};

/** `on`/`off`, and the spellings someone typing a URL by hand will reach for. */
function flag(sp: SearchParams, k: string, fallback: boolean): boolean {
  const v = one(sp, k)?.toLowerCase();
  if (v === undefined || v === "") return fallback;
  if (["on", "1", "true", "yes"].includes(v)) return true;
  if (["off", "0", "false", "no"].includes(v)) return false;
  return fallback;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Zero means "skip this view"; anything else is held to a sane few seconds. */
const dwellMsOf = (sec: number) => (sec === 0 ? 0 : clamp(sec, 2, 600) * 1000);

/**
 * `dwell=15` sets every view, `dwell=games:15,schedule:0` sets them one by one
 * and leaves the rest at the default. A view given zero seconds drops out of
 * the cycle altogether. Anything unparseable is ignored rather than throwing —
 * a typo on a projector must not blank the screen.
 */
function parseDwell(raw: string | undefined): Record<BoardViewId, number> {
  const out = Object.fromEntries(BOARD_VIEWS.map((v) => [v, DEFAULT_DWELL_SEC * 1000])) as Record<BoardViewId, number>;
  if (!raw) return out;

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    for (const v of BOARD_VIEWS) out[v] = dwellMsOf(seconds);
    return out;
  }

  for (const part of raw.split(",")) {
    const [name, value] = part.split(":").map((x) => x.trim());
    const id = BOARD_VIEWS.find((v) => v === name);
    const n = Number(value);
    if (id && value !== "" && Number.isFinite(n) && n >= 0) out[id] = dwellMsOf(n);
  }
  return out;
}

export function parseBoardConfig(
  sp: SearchParams,
  ctx: { status: string; hasVenueImage: boolean },
): BoardConfig {
  const rawView = one(sp, "view")?.toLowerCase();
  const pinnedView = BOARD_VIEWS.find((v) => v === rawView);

  let mode: BoardConfig["mode"];
  let pinned: BoardViewId = "games";
  if (pinnedView) {
    mode = "pinned";
    pinned = pinnedView;
  } else if (rawView === "all") {
    mode = "all";
  } else if (PRE_START.includes(ctx.status)) {
    // Before the field is locked there is nothing to rotate between: a
    // half-empty draw and a plan nobody has read past is just movement.
    mode = "pinned";
  } else {
    mode = "cycle";
  }

  const standings = one(sp, "standings")?.toLowerCase();
  // `contrast=high` came first and still works; it now names a look like any
  // other, and an explicit `look` wins over it.
  const look = one(sp, "look")?.toLowerCase();
  const contrast = one(sp, "contrast")?.toLowerCase();
  const scale = Number(one(sp, "scale"));
  const inset = Number(one(sp, "inset"));
  const msg = one(sp, "msg");

  return {
    mode,
    pinned,
    dwellMs: parseDwell(one(sp, "dwell")),
    timer: flag(sp, "timer", true),
    qr: flag(sp, "qr", true),
    map: flag(sp, "map", ctx.hasVenueImage),
    band: flag(sp, "band", true),
    standings: standings === "groups" || standings === "bracket" ? standings : "auto",
    look: findLook(look ?? (contrast === "high" ? "contrast" : DEFAULT_LOOK.id)).id,
    scale: Number.isFinite(scale) ? clamp(scale, 0.8, 1.4) : 1,
    inset: Number.isFinite(inset) ? clamp(inset, 0, 5) : 0,
    msg: msg ? msg.slice(0, 120) : null,
  };
}

/**
 * Which views the cycle actually visits. A view is dropped when it has nothing
 * to say — no bracket drawn yet, no rounds planned — or when it has been given
 * zero seconds, which is how a board is told to leave it out.
 *
 * Zeroing all three would leave an empty screen, so that is read as no
 * preference rather than obeyed.
 */
export function availableViews(
  cfg: BoardConfig,
  has: { groups: boolean; knockout: boolean; slots: boolean },
): BoardViewId[] {
  if (cfg.mode === "pinned") return [cfg.pinned];
  const present = BOARD_VIEWS.filter((v) => {
    if (v === "standings") return has.groups || has.knockout;
    if (v === "schedule") return has.slots;
    return true;
  });
  const wanted = present.filter((v) => cfg.dwellMs[v] > 0);
  const out = wanted.length > 0 ? wanted : present;
  return out.length > 0 ? out : ["games"];
}

/**
 * Group tables while a group round is on, the tree once it is knockout —
 * and the roster when neither exists yet.
 */
export function standingsKind(
  cfg: BoardConfig,
  ctx: { stage: string | null; hasGroups: boolean; hasKnockout: boolean },
): StandingsKind {
  if (cfg.standings === "groups") return ctx.hasGroups ? "groups" : "roster";
  if (cfg.standings === "bracket") return ctx.hasKnockout ? "bracket" : "roster";
  if (ctx.stage && ctx.stage !== "GROUP" && ctx.hasKnockout) return "bracket";
  if (ctx.hasGroups) return "groups";
  if (ctx.hasKnockout) return "bracket";
  return "roster";
}

// -------------------------------------------------------------------- rounds

export interface ScheduleSlot {
  id: string;
  label: string;
  index: number;
  projection: SlotProjection;
}

export interface ScheduleRow {
  id: string;
  label: string;
  /** Round number as a player counts them, 1-based. */
  number: number;
  state: SlotProjection["state"];
  /** Start of the round, break included. Null under manual rounds. */
  startIso: string | null;
  /** Only set for the round that is running: when it is due to end. */
  endIso: string | null;
  delaySec: number;
  games: number;
}

/**
 * The schedule readout: start times, break included, straight off the
 * projection so an over-running round pushes everything behind it here too.
 * Done rounds are dropped once the tournament is under way — the screen is
 * about what happens next, not what already did.
 */
export function scheduleRows(
  slots: ScheduleSlot[],
  gamesPerSlot: (slotId: string) => number,
  opts: { manualRounds: boolean; keepDone?: boolean },
): ScheduleRow[] {
  const anyLive = slots.some((s) => s.projection.state !== "upcoming");
  return slots
    .filter((s) => opts.keepDone || !anyLive || s.projection.state !== "done")
    .map((s) => ({
      id: s.id,
      label: s.label,
      number: s.index + 1,
      state: s.projection.state,
      startIso: opts.manualRounds ? null : s.projection.projectedStart.toISOString(),
      endIso: opts.manualRounds || s.projection.state !== "running" ? null : s.projection.projectedEnd.toISOString(),
      delaySec: s.projection.delaySec,
      games: gamesPerSlot(s.id),
    }));
}

// -------------------------------------------------------------------- podium

export interface PodiumMatch {
  stage: string;
  status: string;
  sourceAKind: string;
  labelA: string;
  labelB: string;
  scoreA: number | null;
  scoreB: number | null;
}

export interface Podium {
  champion: string;
  runnerUp: string;
  score: string | null;
  third: string | null;
}

/**
 * Who won. The decider is the grand final when there is one, otherwise the
 * final — told apart from the third-place match that shares its slot by its
 * sources, exactly as the bracket does it.
 */
export function podium(matches: PodiumMatch[]): Podium | null {
  const isThird = (m: PodiumMatch) => m.stage === "THIRD" || (m.stage === "FINAL" && m.sourceAKind === "LOSER");
  const decider =
    matches.find((m) => m.stage === "GRAND_FINAL") ?? matches.find((m) => m.stage === "FINAL" && !isThird(m));
  if (!decider || decider.status !== "CONFIRMED") return null;
  if (decider.scoreA === null || decider.scoreB === null || decider.scoreA === decider.scoreB) return null;

  const aWon = decider.scoreA > decider.scoreB;
  const thirdMatch = matches.find((m) => isThird(m) && m.status === "CONFIRMED");
  const third =
    thirdMatch && thirdMatch.scoreA !== null && thirdMatch.scoreB !== null && thirdMatch.scoreA !== thirdMatch.scoreB
      ? thirdMatch.scoreA > thirdMatch.scoreB
        ? thirdMatch.labelA
        : thirdMatch.labelB
      : null;

  return {
    champion: aWon ? decider.labelA : decider.labelB,
    runnerUp: aWon ? decider.labelB : decider.labelA,
    score: `${Math.max(decider.scoreA, decider.scoreB)}:${Math.min(decider.scoreA, decider.scoreB)}`,
    third,
  };
}

// ---------------------------------------------------------------------- type

/**
 * Names shrink to fit rather than turning into "Schützengarte…". The board's
 * type steps are fixed (see globals.css); this picks how far down them a set
 * of names has to go, from the longest one in the group.
 */
export function fitClass(names: string[], steps: readonly string[], charsAtTop: number): string {
  const longest = names.reduce((n, s) => Math.max(n, s.length), 0);
  for (let i = 0; i < steps.length; i++) {
    // Each step down buys roughly a third more characters on the same line.
    if (longest <= charsAtTop * Math.pow(1.35, i)) return steps[i]!;
  }
  return steps[steps.length - 1]!;
}
