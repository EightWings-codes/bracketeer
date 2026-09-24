/**
 * Pure bracket resolution: given every match of a tournament, work out which
 * team each source reference now points at, and which matches must be
 * updated. Also *unresolves* — a downstream match whose source is no longer
 * decided gets its teams cleared, unless it has already started or been
 * reported, in which case it is flagged out of sync for the admin.
 */
import {
  compareAcrossGroups,
  computeStandings,
  type ScoringRules,
  type StandingRow,
  type TeamRef,
} from "./standings";

export type SourceKind = "TEAM" | "WINNER" | "LOSER" | "GROUP_RANK" | "WILDCARD";
export type MatchStatus = "SCHEDULED" | "REPORTED" | "CONFIRMED" | "VOID";

export interface ResolvableMatch {
  id: string;
  slotIndex: number;
  status: MatchStatus;
  /** True when the match's slot has a startedAt. */
  slotStarted: boolean;
  groupId: string | null;
  teamAId: string | null;
  teamBId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  sourceAKind: SourceKind;
  sourceAMatchId: string | null;
  sourceAGroupId: string | null;
  sourceARank: number | null;
  sourceBKind: SourceKind;
  sourceBMatchId: string | null;
  sourceBGroupId: string | null;
  sourceBRank: number | null;
}

export interface ResolvableGroup {
  id: string;
  teams: TeamRef[];
}

export interface ResolveInput {
  matches: ResolvableMatch[];
  groups: ResolvableGroup[];
  rules: ScoringRules;
  /** Position in the group table that feeds the wildcard pool (advancePerGroup + 1). */
  wildcardPosition: number;
}

export interface ResolveResult {
  updates: Array<{ id: string; teamAId: string | null; teamBId: string | null }>;
  /** Matches that should have changed but were left alone (started/reported). */
  outOfSync: string[];
  /** Group standings computed along the way (for display/audit). */
  standings: Map<string, StandingRow[]>;
}

function groupComplete(groupId: string, matches: ResolvableMatch[]): boolean {
  const ms = matches.filter((m) => m.groupId === groupId);
  return ms.length > 0 && ms.every((m) => m.status === "CONFIRMED");
}

export function resolveSources(input: ResolveInput): ResolveResult {
  const working = [...input.matches]
    .map((m) => ({ ...m }))
    .sort((a, b) => a.slotIndex - b.slotIndex);
  const byId = new Map(working.map((m) => [m.id, m]));
  const standings = new Map<string, StandingRow[]>();
  const complete = new Map<string, boolean>();

  for (const g of input.groups) {
    const done = groupComplete(g.id, working);
    complete.set(g.id, done);
    const played = working
      .filter((m) => m.groupId === g.id && m.status === "CONFIRMED")
      .filter((m) => m.teamAId && m.teamBId && m.scoreA !== null && m.scoreB !== null)
      .map((m) => ({
        teamAId: m.teamAId!,
        teamBId: m.teamBId!,
        scoreA: m.scoreA!,
        scoreB: m.scoreB!,
      }));
    standings.set(g.id, computeStandings(g.teams, played, input.rules));
  }

  const allGroupsComplete =
    input.groups.length > 0 && input.groups.every((g) => complete.get(g.id));

  // Wildcard pool: n-th placed of every group, cross-compared.
  let wildcards: StandingRow[] = [];
  if (allGroupsComplete) {
    wildcards = input.groups
      .map((g) => standings.get(g.id)!.find((r) => r.position === input.wildcardPosition))
      .filter((r): r is StandingRow => !!r)
      .sort((a, b) => compareAcrossGroups(a, b) || a.name.localeCompare(b.name));
  }

  const resolve = (
    kind: SourceKind,
    matchId: string | null,
    groupId: string | null,
    rank: number | null,
    current: string | null,
  ): string | null => {
    switch (kind) {
      case "TEAM":
        return current;
      case "WINNER":
      case "LOSER": {
        const src = matchId ? byId.get(matchId) : undefined;
        if (!src || src.status !== "CONFIRMED") return null;
        if (!src.teamAId || !src.teamBId || src.scoreA === null || src.scoreB === null)
          return null;
        if (src.scoreA === src.scoreB) return null; // draw: admin must decide
        const aWon = src.scoreA > src.scoreB;
        return kind === "WINNER" ? (aWon ? src.teamAId : src.teamBId) : aWon ? src.teamBId : src.teamAId;
      }
      case "GROUP_RANK": {
        if (!groupId || !rank || !complete.get(groupId)) return null;
        return standings.get(groupId)?.find((r) => r.position === rank)?.id ?? null;
      }
      case "WILDCARD": {
        if (!allGroupsComplete || !rank) return null;
        return wildcards[rank - 1]?.id ?? null;
      }
    }
  };

  const updates: ResolveResult["updates"] = [];
  const outOfSync: string[] = [];

  for (const m of working) {
    if (m.sourceAKind === "TEAM" && m.sourceBKind === "TEAM") continue;
    const wantA = resolve(m.sourceAKind, m.sourceAMatchId, m.sourceAGroupId, m.sourceARank, m.teamAId);
    const wantB = resolve(m.sourceBKind, m.sourceBMatchId, m.sourceBGroupId, m.sourceBRank, m.teamBId);
    if (wantA === m.teamAId && wantB === m.teamBId) continue;

    const frozen = m.status === "REPORTED" || m.status === "CONFIRMED" || m.slotStarted;
    if (frozen) {
      outOfSync.push(m.id);
      continue;
    }
    m.teamAId = wantA;
    m.teamBId = wantB;
    updates.push({ id: m.id, teamAId: wantA, teamBId: wantB });
  }

  return { updates, outOfSync, standings };
}
