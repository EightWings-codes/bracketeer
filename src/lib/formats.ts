/**
 * Declarative tournament format presets. One generic generator (bracket.ts)
 * consumes a FormatConfig; adding a format is adding a row here.
 */
export interface FormatConfig {
  id: string;
  label: string;
  /** null = any team count (round robin). */
  teamCount: number | null;
  /** 0 = no group stage (pure knockout). */
  groupCount: number;
  /** Ignored when teamCount is null (derived from the field). */
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
  if (c.groupCount > 0 && c.groupCount * c.groupSize !== teamCount) {
    return "Group layout does not match the team count.";
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
  if (c.groupCount > 0 && c.advancePerGroup > c.groupSize) {
    return "More teams advance than fit in a group.";
  }
  return null;
}

/** Formats applicable to a given confirmed team count. */
export function presetsFor(teamCount: number): FormatConfig[] {
  return PRESETS.filter((p) => validateFormat(p, teamCount) === null);
}
