/**
 * Group standings, pure. Tiebreak order:
 *   points → head-to-head among the tied subset (recursing only while the
 *   subset shrinks) → overall diff → scoreFor → name.
 * Teams still tied after everything but name share a rank number.
 */

export interface TeamRef {
  id: string;
  name: string;
}

export interface ConfirmedMatch {
  teamAId: string;
  teamBId: string;
  scoreA: number;
  scoreB: number;
}

export interface ScoringRules {
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
}

export interface StandingRow {
  id: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  scoreFor: number;
  scoreAgainst: number;
  diff: number;
  points: number;
  /** Shared on a true tie. */
  rank: number;
  /** Strict 1-based position after all tiebreaks (name last). */
  position: number;
}

type Row = Omit<StandingRow, "rank" | "position">;

function tally(
  teams: TeamRef[],
  matches: ConfirmedMatch[],
  rules: ScoringRules,
): Map<string, Row> {
  const rows = new Map<string, Row>();
  for (const t of teams) {
    rows.set(t.id, {
      id: t.id,
      name: t.name,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      scoreFor: 0,
      scoreAgainst: 0,
      diff: 0,
      points: 0,
    });
  }
  for (const m of matches) {
    const a = rows.get(m.teamAId);
    const b = rows.get(m.teamBId);
    if (!a || !b) continue;
    a.played++;
    b.played++;
    a.scoreFor += m.scoreA;
    a.scoreAgainst += m.scoreB;
    b.scoreFor += m.scoreB;
    b.scoreAgainst += m.scoreA;
    if (m.scoreA > m.scoreB) {
      a.won++;
      b.lost++;
      a.points += rules.pointsWin;
      b.points += rules.pointsLoss;
    } else if (m.scoreA < m.scoreB) {
      b.won++;
      a.lost++;
      b.points += rules.pointsWin;
      a.points += rules.pointsLoss;
    } else {
      a.drawn++;
      b.drawn++;
      a.points += rules.pointsDraw;
      b.points += rules.pointsDraw;
    }
  }
  for (const r of rows.values()) r.diff = r.scoreFor - r.scoreAgainst;
  return rows;
}

function bucketBy<T>(items: T[], key: (t: T) => number): T[][] {
  const sorted = [...items].sort((x, y) => key(y) - key(x));
  const out: T[][] = [];
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (last && key(last[0]!) === key(it)) last.push(it);
    else out.push([it]);
  }
  return out;
}

/**
 * Resolve an ordering into tiers. Rows in the same tier are truly tied.
 * `matches` must already be restricted to games among `rows`' teams when
 * called recursively (the caller does that).
 */
function resolve(
  rows: Row[],
  matches: ConfirmedMatch[],
  rules: ScoringRules,
): Row[][] {
  const tiers: Row[][] = [];
  for (const bucket of bucketBy(rows, (r) => r.points)) {
    if (bucket.length === 1) {
      tiers.push(bucket);
      continue;
    }
    // Head-to-head mini-table among the tied subset.
    const ids = new Set(bucket.map((r) => r.id));
    const sub = matches.filter((m) => ids.has(m.teamAId) && ids.has(m.teamBId));
    const mini = tally(bucket, sub, rules);
    const miniBuckets = bucketBy(bucket, (r) => mini.get(r.id)!.points);
    if (miniBuckets.length > 1) {
      // The subset shrank: recurse on each sub-bucket.
      for (const sb of miniBuckets) tiers.push(...resolve(sb, sub, rules));
      continue;
    }
    // Head-to-head didn't separate anyone: fall through to diff, scoreFor.
    for (const byDiff of bucketBy(bucket, (r) => r.diff)) {
      for (const byFor of bucketBy(byDiff, (r) => r.scoreFor)) {
        tiers.push([...byFor].sort((x, y) => x.name.localeCompare(y.name)));
      }
    }
  }
  return tiers;
}

export function computeStandings(
  teams: TeamRef[],
  matches: ConfirmedMatch[],
  rules: ScoringRules,
): StandingRow[] {
  const rows = [...tally(teams, matches, rules).values()];
  const tiers = resolve(rows, matches, rules);
  const out: StandingRow[] = [];
  let position = 0;
  for (const tier of tiers) {
    const rank = position + 1;
    for (const r of tier) {
      position++;
      out.push({ ...r, rank, position });
    }
  }
  return out;
}

/** Comparator for cross-group comparison (wildcards): points → diff → scoreFor. */
export function compareRows(a: StandingRow, b: StandingRow): number {
  return b.points - a.points || b.diff - a.diff || b.scoreFor - a.scoreFor;
}

/**
 * Compare two rows that come from *different* groups — the wildcard pool.
 * Groups need not be the same size (9 teams split 5 and 4), and a team with
 * one more match behind it would otherwise carry more points for the same
 * form, so once the match counts differ everything is read per match played.
 */
export function compareAcrossGroups(a: StandingRow, b: StandingRow): number {
  if (a.played === b.played) return compareRows(a, b);
  const per = (value: number, played: number) => (played > 0 ? value / played : 0);
  return (
    per(b.points, b.played) - per(a.points, a.played) ||
    per(b.diff, b.played) - per(a.diff, a.played) ||
    per(b.scoreFor, b.played) - per(a.scoreFor, a.played)
  );
}
