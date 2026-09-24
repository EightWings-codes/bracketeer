/**
 * Generic plan generator: FormatConfig + teams → groups, slots, matches.
 * Pure. Bracket matches carry *source references* rather than teams; the DB
 * layer (tournament.ts) resolves them as results come in.
 */
import type { FormatConfig } from "./formats";
import { eliminationOf, qualifierCount, validateFormat } from "./formats";
import { roundRobinRounds } from "./roundrobin";
import { shuffle } from "./rng";

export interface TeamRef {
  id: string;
  name: string;
  seed: number | null;
}

export const STAGES = [
  "GROUP",
  "R32",
  "R16",
  "QUARTER",
  "SEMI",
  "THIRD",
  "FINAL",
  "LOSERS",
  "GRAND_FINAL",
] as const;

export type Stage = (typeof STAGES)[number];

export type PlanSource =
  | { kind: "TEAM"; teamId: string }
  | { kind: "WINNER"; matchKey: string }
  | { kind: "LOSER"; matchKey: string }
  | { kind: "GROUP_RANK"; groupKey: string; rank: number }
  | { kind: "WILDCARD"; rank: number };

export interface PlanGroup {
  key: string;
  name: string;
  order: number;
  teamIds: string[];
}

export interface PlanSlot {
  index: number;
  label: string;
  stage: Stage;
}

export interface PlanMatch {
  key: string;
  slotIndex: number;
  tableNo: number;
  groupKey: string | null;
  sourceA: PlanSource;
  sourceB: PlanSource;
}

export interface Plan {
  groups: PlanGroup[];
  slots: PlanSlot[];
  matches: PlanMatch[];
}

const GROUP_NAMES = "ABCDEFGHIJKLMNOP";

/**
 * Team order for seeding: all seeded → by seed; none → shuffled;
 * mixed → seeded first (by seed), then the rest shuffled behind them.
 */
export function orderTeams(teams: TeamRef[], rng: () => number): TeamRef[] {
  const seeded = teams
    .filter((t) => t.seed !== null)
    .sort((a, b) => a.seed! - b.seed! || a.name.localeCompare(b.name));
  const unseeded = teams.filter((t) => t.seed === null);
  return [...seeded, ...shuffle(unseeded, rng)];
}

/**
 * The group sizes snake seeding produces for a field that does not divide
 * evenly — 9 into 2 gives [5, 4]. Derived from the seeding itself rather than
 * a formula, so the planner and the validator can never disagree about which
 * group holds the extra team.
 */
export function snakeGroupSizes(teamCount: number, groupCount: number): number[] {
  if (groupCount < 1) return [];
  const sizes = Array.from({ length: groupCount }, () => 0);
  for (let i = 0; i < teamCount; i++) {
    const row = Math.floor(i / groupCount);
    const col = i % groupCount;
    sizes[row % 2 === 0 ? col : groupCount - 1 - col]!++;
  }
  return sizes;
}

/** Snake-seed an ordered list into `groupCount` groups. */
export function snakeGroups(ordered: TeamRef[], groupCount: number): TeamRef[][] {
  const groups: TeamRef[][] = Array.from({ length: groupCount }, () => []);
  ordered.forEach((t, i) => {
    const row = Math.floor(i / groupCount);
    const col = i % groupCount;
    const g = row % 2 === 0 ? col : groupCount - 1 - col;
    groups[g]!.push(t);
  });
  return groups;
}

/** Standard bracket seed order, 1-based: 2 → [1,2]; 4 → [1,4,2,3]; 8 → [1,8,4,5,2,7,3,6]. */
export function seedOrder(n: number): number[] {
  let order = [1];
  while (order.length < n) {
    const size = order.length * 2;
    const next: number[] = [];
    for (const s of order) next.push(s, size + 1 - s);
    order = next;
  }
  return order;
}

function stageFor(matchesInRound: number): Stage {
  if (matchesInRound >= 16) return "R32";
  if (matchesInRound >= 8) return "R16";
  if (matchesInRound === 4) return "QUARTER";
  if (matchesInRound === 2) return "SEMI";
  return "FINAL";
}

function roundLabel(stage: Stage): string {
  switch (stage) {
    case "R32":
      return "Round of 32";
    case "R16":
      return "Round of 16";
    case "QUARTER":
      return "Quarter-finals";
    case "SEMI":
      return "Semi-finals";
    case "FINAL":
      return "Final";
    case "THIRD":
      return "3rd place";
    case "GRAND_FINAL":
      return "Grand final";
    default:
      return "Group";
  }
}

/** Stage name for headings and the timing editor — "Round of 16", "Final"… */
export function stageLabel(stage: Stage): string {
  switch (stage) {
    case "GROUP":
      return "Group stage";
    case "LOSERS":
      return "Losers bracket";
    case "GRAND_FINAL":
      return "Grand final";
    default:
      return roundLabel(stage);
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Lay out knockout entrants into first-round pairs.
 * Group-based: static cross-group pattern so a group's 1st and 2nd land in
 * opposite halves; wildcards fill leftovers in rank order.
 * Otherwise: standard seeding over the ordered source list.
 */
export function layoutFirstRound(
  config: FormatConfig,
  groupKeys: string[],
  ordered: TeamRef[],
): Array<[PlanSource, PlanSource]> {
  const q = qualifierCount(config, ordered.length);
  const pairCount = q / 2;
  const G = groupKeys.length;

  if (G === 0) {
    const order = seedOrder(q);
    const pairs: Array<[PlanSource, PlanSource]> = [];
    for (let i = 0; i < q; i += 2) {
      const a = ordered[order[i]! - 1]!;
      const b = ordered[order[i + 1]! - 1]!;
      pairs.push([{ kind: "TEAM", teamId: a.id }, { kind: "TEAM", teamId: b.id }]);
    }
    return pairs;
  }

  const slots: Array<[PlanSource | null, PlanSource | null]> = Array.from(
    { length: pairCount },
    () => [null, null],
  );
  const leftovers: PlanSource[] = [];

  if (G <= pairCount) {
    // Winners own a pair each; runners-up go to the opposite half.
    groupKeys.forEach((gk, i) => {
      slots[i]![0] = { kind: "GROUP_RANK", groupKey: gk, rank: 1 };
    });
    if (config.advancePerGroup >= 2) {
      const shift = Math.ceil(G / 2);
      groupKeys.forEach((gk, i) => {
        const target = (i + shift) % pairCount;
        const src: PlanSource = { kind: "GROUP_RANK", groupKey: gk, rank: 2 };
        if (slots[target]![1] === null) slots[target]![1] = src;
        else leftovers.push(src);
      });
    }
    for (let r = 3; r <= config.advancePerGroup; r++) {
      for (const gk of groupKeys) leftovers.push({ kind: "GROUP_RANK", groupKey: gk, rank: r });
    }
  } else {
    // More groups than pairs: fall back to seed order over ranks.
    const sources: PlanSource[] = [];
    for (let r = 1; r <= config.advancePerGroup; r++) {
      for (const gk of groupKeys) sources.push({ kind: "GROUP_RANK", groupKey: gk, rank: r });
    }
    for (let w = 1; w <= config.wildcards; w++) sources.push({ kind: "WILDCARD", rank: w });
    const order = seedOrder(q);
    return chunk(order, 2).map(([x, y]) => [sources[x! - 1]!, sources[y! - 1]!]);
  }

  for (let w = 1; w <= config.wildcards; w++) leftovers.push({ kind: "WILDCARD", rank: w });

  // Fill empty positions in pair order.
  for (const slot of slots) {
    for (let side = 0; side < 2; side++) {
      if (slot[side] === null) slot[side] = leftovers.shift() ?? null;
    }
  }
  return slots.map(([a, b]) => {
    if (!a || !b) throw new Error("Knockout layout did not fill every position.");
    return [a, b];
  });
}

/**
 * Double elimination: a losers bracket runs alongside the winners bracket and
 * you are only out after a second defeat. Rounds are emitted in playing order
 * — WB round 1, then for every further winners round a "minor" losers round
 * (survivors play each other) before it and a "major" one after it (minor
 * winners meet the teams just dropped out of the winners bracket) — so every
 * source reference points at a match that is already scheduled.
 *
 * The grand final is a single match: no bracket reset, so the losers-bracket
 * champion does not have to win twice.
 */
export function doubleEliminationRounds(
  ordered: TeamRef[],
  emit: (label: string, stage: Stage, pairs: Array<[PlanSource, PlanSource]>) => string[],
): void {
  const n = ordered.length;
  const k = Math.round(Math.log2(n));
  if (!Number.isInteger(k) || 2 ** k !== n || k < 2) {
    throw new Error("Double elimination needs a power of two teams, at least 4.");
  }

  const winner = (key: string): PlanSource => ({ kind: "WINNER", matchKey: key });
  const loser = (key: string): PlanSource => ({ kind: "LOSER", matchKey: key });
  const pairUp = (src: PlanSource[]): Array<[PlanSource, PlanSource]> =>
    chunk(src, 2).map(([a, b]) => [a!, b!] as [PlanSource, PlanSource]);
  const wbLabel = (r: number, count: number) =>
    r === k - 1 ? "Winners final" : `Winners ${roundLabel(stageFor(count)).toLowerCase()}`;

  const order = seedOrder(n);
  const openers = chunk(order, 2).map(
    ([x, y]) =>
      [
        { kind: "TEAM", teamId: ordered[x! - 1]!.id },
        { kind: "TEAM", teamId: ordered[y! - 1]!.id },
      ] as [PlanSource, PlanSource],
  );

  let wbKeys = emit(wbLabel(0, openers.length), stageFor(openers.length), openers);
  let wbAdvance = wbKeys.map(winner);
  let lbFeed = wbKeys.map(loser);
  let lbRound = 0;

  for (let r = 1; r < k; r++) {
    const minorKeys = emit(`Losers round ${++lbRound}`, "LOSERS", pairUp(lbFeed));

    const wbPairs = pairUp(wbAdvance);
    wbKeys = emit(wbLabel(r, wbPairs.length), stageFor(wbPairs.length), wbPairs);
    wbAdvance = wbKeys.map(winner);

    // Reversing the drop-downs keeps a team from immediately replaying whoever
    // knocked them out of the winners bracket.
    const drops = wbKeys.map(loser).reverse();
    const majorKeys = emit(
      `Losers round ${++lbRound}`,
      "LOSERS",
      minorKeys.map((key, i) => [winner(key), drops[i]!] as [PlanSource, PlanSource]),
    );
    lbFeed = majorKeys.map(winner);
  }

  emit("Grand final", "GRAND_FINAL", [[wbAdvance[0]!, lbFeed[0]!]]);
}

export interface GroupFixture {
  groupKey: string;
  /** Its round in its own group's round robin — the preferred playing order. */
  round: number;
  teamAId: string;
  teamBId: string;
}

/**
 * Fill every table in every round.
 *
 * Playing group round 1 across the field and then group round 2 is the natural
 * order, but it leaves tables standing idle whenever a round's fixtures do not
 * divide by the table count — three tables and four fixtures means a round of
 * three and a round of one. So fixtures are packed instead: a slot takes the
 * earliest-round fixture whose two teams are not already playing in it, and
 * when the current round runs out it pulls the next round of a group whose
 * teams are free. Nothing but the last slot is ever short.
 *
 * Ties go to whoever has rested longest, so pulling a later round forward does
 * not make one group play three slots in a row while another waits.
 */
export function packGroupStage(fixtures: GroupFixture[], tableCount: number): GroupFixture[][] {
  const pending = [...fixtures];
  const lastPlayed = new Map<string, number>();
  const slots: GroupFixture[][] = [];

  while (pending.length > 0) {
    const busy = new Set<string>();
    const slot: GroupFixture[] = [];
    const slotIndex = slots.length;

    while (slot.length < tableCount) {
      let pick = -1;
      let pickRound = Infinity;
      let pickRest = Infinity;
      for (let i = 0; i < pending.length; i++) {
        const f = pending[i]!;
        if (busy.has(f.teamAId) || busy.has(f.teamBId)) continue;
        const rest = Math.min(lastPlayed.get(f.teamAId) ?? -1, lastPlayed.get(f.teamBId) ?? -1);
        if (f.round < pickRound || (f.round === pickRound && rest < pickRest)) {
          pick = i;
          pickRound = f.round;
          pickRest = rest;
        }
      }
      if (pick < 0) break; // every remaining fixture needs a team already on a table
      const [f] = pending.splice(pick, 1);
      busy.add(f!.teamAId);
      busy.add(f!.teamBId);
      lastPlayed.set(f!.teamAId, slotIndex);
      lastPlayed.set(f!.teamBId, slotIndex);
      slot.push(f!);
    }

    slots.push(slot);
  }
  return slots;
}

export function generatePlan(
  config: FormatConfig,
  teams: TeamRef[],
  tableCount: number,
  rng: () => number,
): Plan {
  const problem = validateFormat(config, teams.length);
  if (problem) throw new Error(problem);
  if (tableCount < 1) throw new Error("Need at least one table.");

  const ordered = orderTeams(teams, rng);
  const groups: PlanGroup[] = [];
  const slots: PlanSlot[] = [];
  const matches: PlanMatch[] = [];
  let slotIndex = 0;
  let matchNo = 0;

  const pushSlot = (label: string, stage: Stage) => {
    slots.push({ index: slotIndex, label, stage });
    return slotIndex++;
  };

  // --- Group stage -------------------------------------------------------
  if (config.groupCount > 0) {
    const groupTeams = snakeGroups(ordered, config.groupCount);
    groupTeams.forEach((ts, i) => {
      groups.push({
        key: GROUP_NAMES[i] ?? `G${i + 1}`,
        name: `Group ${GROUP_NAMES[i] ?? i + 1}`,
        order: i,
        teamIds: ts.map((t) => t.id),
      });
    });

    // Each group gets its own round robin — with uneven groups the bigger one
    // simply has rounds the smaller one has already finished — and the fixtures
    // are then packed onto the tables by packGroupStage.
    const fixtures: GroupFixture[] = [];
    groupTeams.forEach((ts, gi) => {
      roundRobinRounds(ts.length).forEach((pairs, r) => {
        for (const [a, b] of pairs) {
          fixtures.push({ groupKey: groups[gi]!.key, round: r, teamAId: ts[a]!.id, teamBId: ts[b]!.id });
        }
      });
    });

    packGroupStage(fixtures, tableCount).forEach((slotFixtures, i) => {
      const si = pushSlot(`Group round ${i + 1}`, "GROUP");
      slotFixtures.forEach((f, ti) =>
        matches.push({
          key: `m${++matchNo}`,
          slotIndex: si,
          tableNo: ti + 1,
          groupKey: f.groupKey,
          sourceA: { kind: "TEAM", teamId: f.teamAId },
          sourceB: { kind: "TEAM", teamId: f.teamBId },
        }),
      );
    });
  }

  /** One knockout round → slots of `tableCount` matches. Returns match keys. */
  const emitRound = (label: string, stage: Stage, pairs: Array<[PlanSource, PlanSource]>): string[] => {
    const roundMatches = pairs.map(([a, b]) => ({
      key: `m${++matchNo}`,
      groupKey: null,
      sourceA: a,
      sourceB: b,
    }));
    const parts = chunk(roundMatches, tableCount);
    parts.forEach((part, pi) => {
      const suffix = parts.length > 1 ? ` (${pi + 1}/${parts.length})` : "";
      const si = pushSlot(`${label}${suffix}`, stage);
      part.forEach((m, ti) => matches.push({ ...m, slotIndex: si, tableNo: ti + 1 }));
    });
    return roundMatches.map((m) => m.key);
  };

  // --- Knockout ----------------------------------------------------------
  if (eliminationOf(config) === "DOUBLE") {
    doubleEliminationRounds(ordered, emitRound);
    slots.sort((a, b) => a.index - b.index);
    return { groups, slots, matches };
  }

  const q = qualifierCount(config, teams.length);
  if (q >= 2) {
    let current = layoutFirstRound(
      config,
      groups.map((g) => g.key),
      ordered,
    );
    let semiKeys: string[] = [];

    while (current.length >= 1) {
      const stage = stageFor(current.length);
      const roundMatches = current.map(([a, b]) => ({
        key: `m${++matchNo}`,
        groupKey: null,
        sourceA: a,
        sourceB: b,
      }));

      const isFinal = current.length === 1;
      const parts = chunk(roundMatches, tableCount);
      const keysThisRound: string[] = [];
      parts.forEach((part, pi) => {
        const suffix = parts.length > 1 ? ` (${pi + 1}/${parts.length})` : "";
        const si = pushSlot(`${roundLabel(stage)}${suffix}`, stage);
        part.forEach((m, ti) => {
          matches.push({ ...m, slotIndex: si, tableNo: ti + 1 });
          keysThisRound.push(m.key);
        });
        // Third-place match shares the final's slot when a table is free.
        if (isFinal && config.thirdPlaceMatch && semiKeys.length === 2) {
          const third = {
            key: `m${++matchNo}`,
            groupKey: null,
            sourceA: { kind: "LOSER", matchKey: semiKeys[0]! } as PlanSource,
            sourceB: { kind: "LOSER", matchKey: semiKeys[1]! } as PlanSource,
          };
          if (tableCount >= 2) {
            matches.push({ ...third, slotIndex: si, tableNo: 2 });
          } else {
            // Only one table: play it before the final in its own slot.
            const finalSlot = slots[si]!;
            const thirdIndex = finalSlot.index;
            finalSlot.index = slotIndex;
            slots.push({ index: thirdIndex, label: roundLabel("THIRD"), stage: "THIRD" });
            slotIndex++;
            for (const m of matches) if (m.slotIndex === si) m.slotIndex = finalSlot.index;
            matches.push({ ...third, slotIndex: thirdIndex, tableNo: 1 });
          }
        }
      });

      if (stage === "SEMI") semiKeys = keysThisRound;
      if (isFinal) break;

      const next: Array<[PlanSource, PlanSource]> = [];
      for (let i = 0; i < keysThisRound.length; i += 2) {
        next.push([
          { kind: "WINNER", matchKey: keysThisRound[i]! },
          { kind: "WINNER", matchKey: keysThisRound[i + 1]! },
        ]);
      }
      current = next;
    }
  }

  slots.sort((a, b) => a.index - b.index);
  return { groups, slots, matches };
}
