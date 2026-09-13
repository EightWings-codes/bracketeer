/**
 * Generic plan generator: FormatConfig + teams → groups, slots, matches.
 * Pure. Bracket matches carry *source references* rather than teams; the DB
 * layer (tournament.ts) resolves them as results come in.
 */
import type { FormatConfig } from "./formats";
import { qualifierCount, validateFormat } from "./formats";
import { roundRobinRounds } from "./roundrobin";
import { shuffle } from "./rng";

export interface TeamRef {
  id: string;
  name: string;
  seed: number | null;
}

export type Stage = "GROUP" | "R16" | "QUARTER" | "SEMI" | "THIRD" | "FINAL";

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
  if (matchesInRound >= 8) return "R16";
  if (matchesInRound === 4) return "QUARTER";
  if (matchesInRound === 2) return "SEMI";
  return "FINAL";
}

function roundLabel(stage: Stage): string {
  switch (stage) {
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
    default:
      return "Group";
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

    const size = groupTeams[0]!.length;
    const rounds = roundRobinRounds(size);
    rounds.forEach((pairs, r) => {
      // Round r of every group at once; no team appears twice in this set.
      const roundMatches: Array<Omit<PlanMatch, "slotIndex" | "tableNo">> = [];
      groups.forEach((g, gi) => {
        const ts = groupTeams[gi]!;
        for (const [a, b] of pairs) {
          roundMatches.push({
            key: `m${++matchNo}`,
            groupKey: g.key,
            sourceA: { kind: "TEAM", teamId: ts[a]!.id },
            sourceB: { kind: "TEAM", teamId: ts[b]!.id },
          });
        }
      });
      const parts = chunk(roundMatches, tableCount);
      parts.forEach((part, pi) => {
        const suffix = parts.length > 1 ? ` (${pi + 1}/${parts.length})` : "";
        const si = pushSlot(`Group round ${r + 1}${suffix}`, "GROUP");
        part.forEach((m, ti) => matches.push({ ...m, slotIndex: si, tableNo: ti + 1 }));
      });
    });
  }

  // --- Knockout ----------------------------------------------------------
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
