/**
 * Read model shared by the public dashboard, team page and control room.
 * One query bundle + derived projection/standings.
 */
import { prisma } from "./prisma";
import { computeStandings, type StandingRow } from "./standings";
import { formatOf, projectionByIndex, slotInputs } from "./tournament";
import { findTheme, parseIconArt, tableLabel as themeTableLabel } from "./themes";
import { roundClock, type SlotProjection } from "./schedule";
import { ordinal } from "./text";

export { ordinal };

export type TournamentView = NonNullable<Awaited<ReturnType<typeof loadTournamentView>>>;
export type ViewMatch = TournamentView["matches"][number];
export type ViewSlot = TournamentView["slots"][number];

export async function loadTournamentView(slug: string, now = new Date()) {
  const t = await prisma.tournament.findUnique({
    where: { slug },
    include: {
      teams: { orderBy: [{ status: "asc" }, { createdAt: "asc" }] },
      groups: { orderBy: { order: "asc" } },
      slots: { orderBy: { index: "asc" } },
      matches: {
        include: {
          teamA: { select: { id: true, name: true } },
          teamB: { select: { id: true, name: true } },
          reports: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
  if (!t) return null;

  const projection = projectionByIndex(t, t.slots, now);
  const slotById = new Map(t.slots.map((s) => [s.id, s]));
  const teamName = new Map(t.teams.map((x) => [x.id, x.name]));
  const teamIcon = new Map(t.teams.map((x) => [x.id, x.icon]));
  const groupName = new Map(t.groups.map((g) => [g.id, g.name]));
  // Short "where does this side come from" reference, e.g. "Losers round 1 T2".
  const matchRef = new Map(
    t.matches.map((m) => [m.id, `${slotById.get(m.slotId)!.label} T${m.tableNo}`]),
  );

  const slots = t.slots.map((s) => ({
    ...s,
    projection: projection.get(s.index)!,
    label: s.label,
  }));

  const matches = t.matches
    .map((m) => {
      const slot = slotById.get(m.slotId)!;
      return {
        ...m,
        slotIndex: slot.index,
        slotLabel: slot.label,
        stage: slot.stage,
        projection: projection.get(slot.index)!,
        groupName: m.groupId ? groupName.get(m.groupId) ?? null : null,
        labelA: describeSide(m.sourceAKind, m.teamA?.name, m.sourceAGroupId, m.sourceARank, groupName, m.sourceAMatchId, matchRef),
        labelB: describeSide(m.sourceBKind, m.teamB?.name, m.sourceBGroupId, m.sourceBRank, groupName, m.sourceBMatchId, matchRef),
      };
    })
    .sort((a, b) => a.slotIndex - b.slotIndex || a.tableNo - b.tableNo);

  const rules = { pointsWin: t.pointsWin, pointsDraw: t.pointsDraw, pointsLoss: t.pointsLoss };
  const standings = new Map<string, StandingRow[]>();
  for (const g of t.groups) {
    const gTeams = t.teams.filter((x) => x.groupId === g.id).map((x) => ({ id: x.id, name: x.name }));
    const played = matches
      .filter((m) => m.groupId === g.id && m.status === "CONFIRMED" && m.teamAId && m.teamBId && m.scoreA !== null && m.scoreB !== null)
      .map((m) => ({ teamAId: m.teamAId!, teamBId: m.teamBId!, scoreA: m.scoreA!, scoreB: m.scoreB! }));
    standings.set(g.id, computeStandings(gTeams, played, rules));
  }

  const running = slots.filter((s) => s.projection.state === "running");
  const upcoming = slots.filter((s) => s.projection.state === "upcoming");
  const delaySec = Math.max(0, ...slots.filter((s) => s.projection.state !== "done").map((s) => s.projection.delaySec));

  return {
    ...t,
    slots,
    matches,
    standings,
    format: formatOf(t),
    running,
    /** Latest projected end across the running rounds — the "ends ~" caption. */
    runningEnd: running.length
      ? new Date(Math.max(...running.map((s) => s.projection.projectedEnd.getTime())))
      : null,
    next: upcoming[0] ?? null,
    upcoming,
    delaySec,
    /** What the room is waiting on — the game, the break, or the start. The
     *  manual-rounds timer; see roundClock. */
    clock: roundClock(t.startsAt, slotInputs(t, t.slots)),
    now,
    teamName,
    /** Team id → ThemeIcon id, for <TeamIcon>. */
    teamIcon,
    themeConfig: findTheme(t.theme),
    /** Organiser-supplied emblem artwork, validated. */
    iconArt: parseIconArt(t.theme, t.iconArt),
    tableLabel: (n: number) => themeTableLabel(findTheme(t.theme), t.tableLabels, n),
  };
}

function describeSide(
  kind: string,
  name: string | undefined,
  groupId: string | null,
  rank: number | null,
  groupName: Map<string, string>,
  sourceMatchId: string | null,
  matchRef: Map<string, string>,
): string {
  if (name) return name;
  const from = sourceMatchId ? matchRef.get(sourceMatchId) : undefined;
  switch (kind) {
    case "GROUP_RANK":
      return `${ordinal(rank ?? 0)} ${groupId ? groupName.get(groupId) ?? "group" : "group"}`;
    case "WILDCARD":
      return `Best 3rd #${rank ?? "?"}`;
    case "WINNER":
      return from ? `Winner of ${from}` : "Winner TBD";
    case "LOSER":
      return from ? `Loser of ${from}` : "Loser TBD";
    default:
      return "TBD";
  }
}


export function slotState(p: SlotProjection) {
  return p.state;
}

export function fmtDelay(sec: number): string {
  const m = Math.round(Math.abs(sec) / 60);
  if (m === 0) return "on time";
  return sec > 0 ? `${m} min late` : `${m} min early`;
}
