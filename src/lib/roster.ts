/**
 * Team-size rules. A tournament with maxTeamSize 1 is a singles event: the
 * entrant's name *is* the player, so the whole UI drops the word "team".
 */
export interface RosterRules {
  minTeamSize: number;
  maxTeamSize: number;
}

export function isSolo(t: RosterRules): boolean {
  return t.maxTeamSize <= 1;
}

/** "Player" / "Team", capitalised for headings. */
export function unit(t: RosterRules, plural = false): string {
  const word = isSolo(t) ? "Player" : "Team";
  return plural ? `${word}s` : word;
}

export function unitLower(t: RosterRules, plural = false): string {
  return unit(t, plural).toLowerCase();
}

/** "1 player", "2–4 players", "exactly 2 players". */
export function describeSize(t: RosterRules): string {
  const { minTeamSize: lo, maxTeamSize: hi } = t;
  if (isSolo(t)) return "one player";
  if (lo === hi) return `exactly ${hi} players`;
  if (lo <= 1) return `up to ${hi} players`;
  return `${lo}–${hi} players`;
}

/**
 * Validate a submitted roster. Returns a message, or null when it fits.
 * Solo entries carry no separate member list — the entrant's name is it.
 */
export function rosterProblem(t: RosterRules, members: string[]): string | null {
  if (isSolo(t)) return null;
  if (members.length < t.minTeamSize) {
    return `This tournament needs ${describeSize(t)} per team — you listed ${members.length}.`;
  }
  if (members.length > t.maxTeamSize) {
    return `At most ${t.maxTeamSize} players per team — you listed ${members.length}.`;
  }
  return null;
}

/** Normalise the roster that gets stored: solo entries are their own member. */
export function normaliseMembers(t: RosterRules, name: string, members: string[]): string[] {
  return isSolo(t) ? [name] : members.slice(0, t.maxTeamSize);
}

/** Guard for the settings form — nonsense bounds would lock registration out. */
export function sizeBoundsProblem(min: number, max: number): string | null {
  if (!Number.isInteger(min) || !Number.isInteger(max)) return "Team sizes must be whole numbers.";
  if (min < 1 || max < 1) return "Team sizes must be at least 1.";
  if (min > max) return "Minimum team size cannot exceed the maximum.";
  if (max > 20) return "Maximum team size is 20.";
  return null;
}
