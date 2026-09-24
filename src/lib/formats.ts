/**
 * Declarative tournament format presets. One generic generator (bracket.ts)
 * consumes a FormatConfig; adding a format is adding a row here.
 */
import { snakeGroupSizes } from "./bracket";
import { ordinal } from "./text";

export interface FormatConfig {
  id: string;
  label: string;
  /** null = any team count (round robin). */
  teamCount: number | null;
  /** 0 = no group stage (pure knockout). */
  groupCount: number;
  /**
   * The *smallest* group. Groups need not be equal: a field that does not
   * divide evenly is snake-seeded into groups whose sizes differ by one
   * (9 teams in 2 groups is 5 and 4), and the smallest is what everything has
   * to fit — nothing may ask a group for more teams than it holds.
   */
  groupSize: number;
  /** Teams per group that advance to the knockout. 0 = no knockout. */
  advancePerGroup: number;
  /** Extra "best n-th placed" qualifiers across groups. */
  wildcards: number;
  thirdPlaceMatch: boolean;
  /**
   * Knockout style. DOUBLE adds a losers bracket and a grand final: you are
   * out after two defeats. Omitted on older stored snapshots — treat as SINGLE.
   */
  elimination?: Elimination;
}

export type Elimination = "SINGLE" | "DOUBLE";

export function eliminationOf(c: FormatConfig): Elimination {
  return c.elimination ?? "SINGLE";
}

export const PRESETS: FormatConfig[] = [
  {
    id: "g12-3x4-qf",
    label: "12 teams · 3 groups of 4 · top 2 + 2 best 3rds · QF · 3rd place",
    teamCount: 12,
    groupCount: 3,
    groupSize: 4,
    advancePerGroup: 2,
    wildcards: 2,
    thirdPlaceMatch: true,
  },
  {
    id: "g16-4x4-qf",
    label: "16 teams · 4 groups of 4 · top 2 · QF",
    teamCount: 16,
    groupCount: 4,
    groupSize: 4,
    advancePerGroup: 2,
    wildcards: 0,
    thirdPlaceMatch: false,
  },
  {
    id: "g8-2x4-sf",
    label: "8 teams · 2 groups of 4 · top 2 · SF",
    teamCount: 8,
    groupCount: 2,
    groupSize: 4,
    advancePerGroup: 2,
    wildcards: 0,
    thirdPlaceMatch: false,
  },
  {
    id: "g6-2x3-sf",
    label: "6 teams · 2 groups of 3 · top 2 · SF",
    teamCount: 6,
    groupCount: 2,
    groupSize: 3,
    advancePerGroup: 2,
    wildcards: 0,
    thirdPlaceMatch: false,
  },
  {
    id: "ko4",
    label: "4 teams · single elimination",
    teamCount: 4,
    groupCount: 0,
    groupSize: 0,
    advancePerGroup: 0,
    wildcards: 0,
    thirdPlaceMatch: false,
  },
  {
    id: "ko8",
    label: "8 teams · single elimination",
    teamCount: 8,
    groupCount: 0,
    groupSize: 0,
    advancePerGroup: 0,
    wildcards: 0,
    thirdPlaceMatch: true,
  },
  {
    id: "ko16",
    label: "16 teams · single elimination",
    teamCount: 16,
    groupCount: 0,
    groupSize: 0,
    advancePerGroup: 0,
    wildcards: 0,
    thirdPlaceMatch: true,
  },
  {
    id: "ko32",
    label: "32 teams · single elimination",
    teamCount: 32,
    groupCount: 0,
    groupSize: 0,
    advancePerGroup: 0,
    wildcards: 0,
    thirdPlaceMatch: true,
  },
  {
    id: "de8",
    label: "8 teams · double elimination",
    teamCount: 8,
    groupCount: 0,
    groupSize: 0,
    advancePerGroup: 0,
    wildcards: 0,
    thirdPlaceMatch: false,
    elimination: "DOUBLE",
  },
  {
    id: "de16",
    label: "16 teams · double elimination",
    teamCount: 16,
    groupCount: 0,
    groupSize: 0,
    advancePerGroup: 0,
    wildcards: 0,
    thirdPlaceMatch: false,
    elimination: "DOUBLE",
  },
  {
    id: "de32",
    label: "32 teams · double elimination",
    teamCount: 32,
    groupCount: 0,
    groupSize: 0,
    advancePerGroup: 0,
    wildcards: 0,
    thirdPlaceMatch: false,
    elimination: "DOUBLE",
  },
  {
    id: "rr",
    label: "Any number · single round robin, no knockout",
    teamCount: null,
    groupCount: 1,
    groupSize: 0,
    advancePerGroup: 0,
    wildcards: 0,
    thirdPlaceMatch: false,
  },
];

export function findPreset(id: string): FormatConfig | undefined {
  return PRESETS.find((p) => p.id === id);
}

// ------------------------------------------------------------ custom builds

/** The id every hand-built format carries; the shape itself is in formatConfig. */
export const CUSTOM_ID = "custom";

export const isCustom = (id: string | null | undefined) => id === CUSTOM_ID;

export interface CustomFormatInput {
  teamCount: number;
  /** 0 = no group stage (straight knockout). */
  groupCount: number;
  /** Teams that reach the knockout — 0 = groups only, no playoff. */
  playoffSize: number;
  thirdPlaceMatch?: boolean;
  elimination?: Elimination;
}

/**
 * Build a format from the two decisions an organiser actually makes: how the
 * group stage is laid out, and how big the playoff is. The two are deliberately
 * independent — three groups of four can feed quarter-finals (top 2 + 2 best
 * 3rds) or semi-finals (the three winners + the best runner-up), and the
 * advance/wildcard split is derived rather than chosen.
 */
export function customFormat(input: CustomFormatInput): FormatConfig {
  const { teamCount, groupCount, playoffSize } = input;
  const elimination = input.elimination ?? "SINGLE";
  const groupSize = groupCount > 0 ? Math.min(...snakeGroupSizes(teamCount, groupCount)) : 0;
  const advancePerGroup = groupCount > 0 ? Math.floor(playoffSize / groupCount) : 0;
  const wildcards = groupCount > 0 ? playoffSize - advancePerGroup * groupCount : 0;
  return {
    id: CUSTOM_ID,
    label: describeCustom({ ...input, elimination }),
    teamCount,
    groupCount,
    groupSize,
    advancePerGroup,
    wildcards,
    thirdPlaceMatch: input.thirdPlaceMatch ?? false,
    elimination,
  };
}

/** "12 teams · 3 groups of 4 · 3 winners + best runner-up · semi-finals". */
export function describeCustom(input: CustomFormatInput & { elimination?: Elimination }): string {
  const { teamCount, groupCount, playoffSize } = input;
  const parts = [`${teamCount} teams`];
  if (groupCount === 0) {
    parts.push(input.elimination === "DOUBLE" ? "double elimination" : "single elimination");
    return parts.join(" · ");
  }
  parts.push(describeGroups(teamCount, groupCount));
  if (playoffSize === 0) {
    parts.push("no playoff");
    return parts.join(" · ");
  }
  const advance = Math.floor(playoffSize / groupCount);
  const wildcards = playoffSize - advance * groupCount;
  parts.push(describeQualifiers(advance, wildcards));
  parts.push(playoffLabel(playoffSize).toLowerCase());
  return parts.join(" · ");
}

/** "3 groups of 4", "one table of 9", "2 groups — 1 of 5 and 1 of 4". */
export function describeGroups(teamCount: number, groupCount: number): string {
  if (groupCount === 1) return `one table of ${teamCount}`;
  const sizes = snakeGroupSizes(teamCount, groupCount);
  const big = Math.max(...sizes);
  const small = Math.min(...sizes);
  if (big === small) return `${groupCount} groups of ${big}`;
  // Uneven: name both sizes, because which group a team lands in matters.
  const bigCount = sizes.filter((n) => n === big).length;
  return `${groupCount} groups — ${bigCount} of ${big} and ${groupCount - bigCount} of ${small}`;
}

/** Chip-sized: "One table of 9" · "3 × 4" · "5 + 4". */
export function describeGroupsShort(teamCount: number, groupCount: number): string {
  if (groupCount === 1) return `One table of ${teamCount}`;
  const sizes = snakeGroupSizes(teamCount, groupCount);
  const even = Math.min(...sizes) === Math.max(...sizes);
  return even ? `${groupCount} × ${sizes[0]}` : sizes.join(" + ");
}

function describeQualifiers(advance: number, wildcards: number): string {
  const place = (n: number) => (n === 1 ? "winner" : n === 2 ? "runner-up" : ordinal(n));
  const base =
    advance === 0
      ? ""
      : advance === 1
        ? "group winners"
        : advance === 2
          ? "top 2"
          : `top ${advance}`;
  if (wildcards === 0) return base;
  const pool = `best ${place(advance + 1)}${wildcards > 1 ? `s (${wildcards})` : ""}`;
  return base ? `${base} + ${pool}` : `${wildcards} ${pool}`;
}

/** "Quarter-finals" for 8, "Semi-finals" for 4, "Final" for 2, "Round of 16"… */
export function playoffLabel(playoffSize: number): string {
  switch (playoffSize) {
    case 0:
      return "No playoff";
    case 2:
      return "Final only";
    case 4:
      return "Semi-finals";
    case 8:
      return "Quarter-finals";
    default:
      return `Round of ${playoffSize}`;
  }
}

/** How a stored config reads back: presets keep their label, builds re-describe. */
export function describeFormat(c: FormatConfig, teamCount: number): string {
  if (c.id !== CUSTOM_ID) return c.label;
  return describeCustom(customInputOf(c, teamCount));
}

/** The builder settings a stored config came from, so the page can reopen on them. */
export function customInputOf(c: FormatConfig, teamCount: number): CustomFormatInput {
  return {
    teamCount: c.teamCount ?? teamCount,
    groupCount: c.groupCount,
    playoffSize: c.groupCount === 0 ? (c.teamCount ?? teamCount) : qualifierCount(c, teamCount),
    thirdPlaceMatch: c.thirdPlaceMatch,
    elimination: eliminationOf(c),
  };
}

/**
 * Group layouts worth offering. A field that does not divide evenly is not
 * excluded — 9 teams can be one table of 9, or two groups of 5 and 4.
 */
export function groupOptions(teamCount: number): number[] {
  const out: number[] = [];
  for (let g = 1; g <= Math.floor(teamCount / 2); g++) {
    if (Math.min(...snakeGroupSizes(teamCount, g)) >= 2) out.push(g);
  }
  return out;
}

/**
 * Playoff sizes a given group layout can actually feed: powers of two that fit
 * the field and never ask a group for more teams than it has.
 */
export function playoffOptions(teamCount: number, groupCount: number): number[] {
  const out = [0];
  const smallest = groupCount > 0 ? Math.min(...snakeGroupSizes(teamCount, groupCount)) : 0;
  for (let q = 2; q <= teamCount; q *= 2) {
    if (groupCount === 0) {
      if (q === teamCount) out.push(q);
      continue;
    }
    if (Math.floor(q / groupCount) > smallest) continue;
    out.push(q);
  }
  return out;
}

export function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/** Number of knockout entrants a config produces (0 = no knockout). */
export function qualifierCount(c: FormatConfig, teamCount: number): number {
  if (c.groupCount === 0) return teamCount;
  return c.groupCount * c.advancePerGroup + c.wildcards;
}

/** Returns a human-readable problem, or null when the format fits the field. */
export function validateFormat(c: FormatConfig, teamCount: number): string | null {
  if (c.teamCount === null) {
    if (teamCount < 3) return "Round robin needs at least 3 teams.";
    return null;
  }
  if (teamCount !== c.teamCount) {
    return `This format needs exactly ${c.teamCount} confirmed teams (you have ${teamCount}).`;
  }
  if (c.groupCount > 0 && Math.min(...snakeGroupSizes(teamCount, c.groupCount)) < 2) {
    return "That many groups would leave a group with a single team.";
  }
  if (eliminationOf(c) === "DOUBLE") {
    if (c.groupCount > 0) return "Double elimination does not take a group stage.";
    if (c.thirdPlaceMatch) return "Double elimination settles 3rd place in the losers bracket.";
    if (teamCount < 4) return "Double elimination needs at least 4 teams.";
    if (!isPowerOfTwo(teamCount)) return `Double elimination needs a power of two teams, got ${teamCount}.`;
  }
  const q = qualifierCount(c, teamCount);
  if (q > 0 && !isPowerOfTwo(q)) {
    return `Knockout needs a power of two entrants, got ${q}.`;
  }
  if (c.groupCount > 0 && c.advancePerGroup > Math.min(...snakeGroupSizes(teamCount, c.groupCount))) {
    return "More teams advance than fit in the smallest group.";
  }
  return null;
}

/** Formats applicable to a given confirmed team count. */
export function presetsFor(teamCount: number): FormatConfig[] {
  return PRESETS.filter((p) => validateFormat(p, teamCount) === null);
}
