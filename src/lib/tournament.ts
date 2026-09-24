/**
 * DB-facing domain logic. Every mutation lives here so server actions stay
 * thin. Authority is re-checked against the DB (status, testMode, tokens)
 * rather than trusting the caller.
 */
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { APP } from "./config";
import { generatePlan, packGroupStage, type PlanSource, type Stage, type TeamRef } from "./bracket";
import { findPreset, validateFormat, type FormatConfig } from "./formats";
import { randomSeed, seededRng } from "./rng";
import { normaliseMembers, rosterProblem, sizeBoundsProblem } from "./roster";
import { findTheme, isValidIcon, pickIcon } from "./themes";
import { resolveSources, type ResolvableMatch } from "./resolve";
import { parseStageTiming, pruneStageTiming, slotTimings, type StageTimingMap } from "./stage-timing";
import { projectSchedule, type SlotInput, type SlotProjection } from "./schedule";

type Db = PrismaClient | Prisma.TransactionClient;

export type TournamentStatusName =
  | "DRAFT"
  | "REGISTRATION"
  | "LOCKED"
  | "READY"
  | "RUNNING"
  | "FINISHED";

export class DomainError extends Error {}

const fail = (msg: string): never => {
  throw new DomainError(msg);
};

// ---------------------------------------------------------------- helpers

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function newToken(): string {
  return randomBytes(16).toString("hex");
}

export function newJoinCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(5), (b) => alphabet[b % alphabet.length]).join("");
}

export async function audit(
  db: Db,
  tournamentId: string,
  actorId: string | null,
  action: string,
  detail: Prisma.InputJsonValue = {},
) {
  await db.auditLog.create({ data: { tournamentId, actorId, action, detail } });
}

async function getTournament(db: Db, id: string) {
  const t = await db.tournament.findUnique({ where: { id } });
  return t ?? fail("Tournament not found.");
}

// ------------------------------------------------------------ tournaments

export interface TournamentInput {
  name: string;
  slug?: string;
  description?: string | null;
  startsAt: Date;
  gameDurationSec?: number;
  breakDurationSec?: number;
  tableCount?: number;
  tableLabels?: string[];
  pointsWin?: number;
  pointsDraw?: number;
  pointsLoss?: number;
  allowDraws?: boolean;
  scoreLabel?: string;
  theme?: string;
  minTeamSize?: number;
  maxTeamSize?: number;
  manualRounds?: boolean;
  testMode?: boolean;
  joinCodeEnabled?: boolean;
  openScoring?: boolean;
}

export async function createTournament(input: TournamentInput, actorId: string) {
  const theme = findTheme(input.theme);
  const name = input.name.trim();
  if (!name) fail("Give the tournament a name.");
  let slug = slugify(input.slug?.trim() || name);
  if (!slug) fail("Slug can't be empty.");
  if (await prisma.tournament.findUnique({ where: { slug } })) {
    slug = `${slug}-${randomBytes(2).toString("hex")}`;
  }
  const t = await prisma.tournament.create({
    data: {
      name,
      slug,
      description: input.description ?? null,
      startsAt: input.startsAt,
      gameDurationSec: input.gameDurationSec ?? 1200,
      breakDurationSec: input.breakDurationSec ?? 300,
      tableCount: input.tableCount ?? 2,
      tableLabels: input.tableLabels ?? [],
      pointsWin: input.pointsWin ?? 3,
      pointsDraw: input.pointsDraw ?? 1,
      pointsLoss: input.pointsLoss ?? 0,
      allowDraws: input.allowDraws ?? theme.defaults.allowDraws,
      theme: theme.id,
      scoreLabel: input.scoreLabel?.trim() || theme.defaults.scoreLabel,
      minTeamSize: input.minTeamSize ?? 1,
      maxTeamSize: input.maxTeamSize ?? 8,
      manualRounds: input.manualRounds ?? false,
      testMode: input.testMode ?? false,
      joinCodeEnabled: input.joinCodeEnabled ?? false,
      joinCode: newJoinCode(),
      openScoring: input.openScoring ?? true,
    },
  });
  await audit(prisma, t.id, actorId, "tournament.create", { name, slug });
  return t;
}

/** Partial update: only keys present in `patch` are written. */
export async function updateTournament(
  id: string,
  patch: Prisma.TournamentUpdateInput,
  actorId: string,
) {
  const t = await getTournament(prisma, id);
  if ("testMode" in patch && t.status !== "DRAFT" && patch.testMode !== t.testMode) {
    fail("Test mode can only be changed while the tournament is a draft.");
  }
  if (typeof patch.slug === "string") patch.slug = slugify(patch.slug);
  if ("minTeamSize" in patch || "maxTeamSize" in patch) {
    const min = Number(patch.minTeamSize ?? t.minTeamSize);
    const max = Number(patch.maxTeamSize ?? t.maxTeamSize);
    const problem = sizeBoundsProblem(min, max);
    if (problem) fail(problem);
  }
  const updated = await prisma.tournament.update({ where: { id }, data: patch });
  await audit(prisma, id, actorId, "tournament.update", patch as Prisma.InputJsonValue);
  return updated;
}

export async function setTournamentStatus(
  id: string,
  status: TournamentStatusName,
  actorId: string,
) {
  const t = await getTournament(prisma, id);
  if (status === "LOCKED" && t.status === "REGISTRATION") {
    // Locking truncates the throttle table for this tournament.
    await prisma.registrationAttempt.deleteMany({ where: { tournamentId: id } });
  }
  await prisma.tournament.update({ where: { id }, data: { status } });
  await audit(prisma, id, actorId, "tournament.status", { from: t.status, to: status });
}

export async function deleteTournament(id: string, actorId: string) {
  const t = await getTournament(prisma, id);
  await prisma.tournament.delete({ where: { id } });
  // Audit rows cascade away with the tournament; log to console for the record.
  console.info(`[audit] ${actorId} deleted tournament ${t.slug}`);
}

// ------------------------------------------------------------------ teams

export interface RegisterInput {
  name: string;
  members: string[];
  contact?: string | null;
  /** ThemeIcon id from the tournament's theme; anything else is dropped. */
  icon?: string | null;
}

export interface RegisterGate {
  ip: string | null;
  joinCode: string | null;
  /** Simulator only: skip code + throttle. Caller must have verified testMode. */
  bypassGates?: boolean;
}

export async function registerTeam(tournamentId: string, input: RegisterInput, gate: RegisterGate) {
  const t = await getTournament(prisma, tournamentId);
  if (t.status !== "REGISTRATION") fail("Registration is not open.");
  const name = input.name.trim();
  if (name.length < 2 || name.length > 40) fail("Name must be 2–40 characters.");
  const listed = input.members.map((m) => m.trim()).filter(Boolean);
  const problem = rosterProblem(t, listed);
  if (problem) fail(problem);
  const members = normaliseMembers(t, name, listed);

  if (!gate.bypassGates) {
    if (t.joinCodeEnabled) {
      const code = (gate.joinCode ?? "").trim().toUpperCase();
      if (!t.joinCode || code !== t.joinCode) fail("Wrong join code.");
    }
    if (gate.ip) {
      const since = new Date(Date.now() - APP.registrationWindowMs);
      const n = await prisma.registrationAttempt.count({
        where: { tournamentId, ip: gate.ip, createdAt: { gte: since } },
      });
      if (n >= APP.registrationMaxPerWindow) fail("Too many registrations from this device. Try again later.");
      await prisma.registrationAttempt.create({ data: { tournamentId, ip: gate.ip } });
    }
  }

  const dup = await prisma.team.findUnique({ where: { tournamentId_name: { tournamentId, name } } });
  if (dup) fail("A team with that name is already registered.");

  // Nobody should end up faceless: an unpicked emblem is assigned, favouring
  // one no other team here has.
  const taken = await prisma.team.findMany({ where: { tournamentId }, select: { icon: true } });
  const icon = pickIcon(t.theme, input.icon, taken.map((x) => x.icon));
  const team = await prisma.team.create({
    data: { tournamentId, name, members, contact: input.contact ?? null, icon, token: newToken() },
  });
  await audit(prisma, tournamentId, null, "team.register", { teamId: team.id, name });
  return team;
}

export async function updateTeam(teamId: string, patch: Prisma.TeamUpdateInput, actorId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, include: { tournament: true } });
  if (!team) fail("Team not found.");
  if (typeof patch.icon === "string" && patch.icon && !isValidIcon(team!.tournament.theme, patch.icon)) {
    fail("That emblem is not part of this tournament's theme.");
  }
  const updated = await prisma.team.update({ where: { id: teamId }, data: patch });
  await audit(prisma, team!.tournamentId, actorId, "team.update", { teamId, ...(patch as object) } as Prisma.InputJsonValue);
  return updated;
}

export async function deleteTeam(teamId: string, actorId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) fail("Team not found.");
  const played = await prisma.match.count({ where: { OR: [{ teamAId: teamId }, { teamBId: teamId }] } });
  if (played > 0) fail("This team is already in the plan. Regenerate the plan first.");
  await prisma.team.delete({ where: { id: teamId } });
  await audit(prisma, team!.tournamentId, actorId, "team.delete", { teamId, name: team!.name });
}

// ------------------------------------------------------------------- plan

export async function confirmedTeamRefs(db: Db, tournamentId: string): Promise<TeamRef[]> {
  const teams = await db.team.findMany({
    where: { tournamentId, status: "CONFIRMED" },
    orderBy: { createdAt: "asc" },
  });
  return teams.map((t) => ({ id: t.id, name: t.name, seed: t.seed }));
}

/**
 * Generate (or regenerate) groups, slots and matches from a format preset.
 * Wipes the existing plan; refuses once any slot has started unless forced.
 */
export async function generateTournamentPlan(
  tournamentId: string,
  /** A preset id, or a config built by hand on the format page. */
  formatOrId: string | FormatConfig,
  actorId: string,
  opts: { seed?: number; force?: boolean } = {},
) {
  const t = await getTournament(prisma, tournamentId);
  if (t.status !== "LOCKED" && t.status !== "READY" && t.status !== "RUNNING") {
    fail("Lock the field before generating a plan.");
  }
  const format =
    typeof formatOrId === "string" ? (findPreset(formatOrId) ?? fail("Unknown format.")) : formatOrId;
  const formatId = format.id;
  const started = await prisma.slot.count({ where: { tournamentId, startedAt: { not: null } } });
  if (started > 0 && !opts.force) fail("A round has already started. Use the danger zone to force regeneration.");

  const teams = await confirmedTeamRefs(prisma, tournamentId);
  const seed = opts.seed ?? t.drawSeed ?? randomSeed();
  const plan = generatePlan(format, teams, t.tableCount, seededRng(seed));

  await prisma.$transaction(async (tx) => {
    await tx.match.deleteMany({ where: { tournamentId } });
    await tx.slot.deleteMany({ where: { tournamentId } });
    await tx.group.deleteMany({ where: { tournamentId } });

    const groupIds = new Map<string, string>();
    for (const g of plan.groups) {
      const row = await tx.group.create({ data: { tournamentId, name: g.name, order: g.order } });
      groupIds.set(g.key, row.id);
      await tx.team.updateMany({ where: { id: { in: g.teamIds } }, data: { groupId: row.id } });
    }
    const slotIds = new Map<number, string>();
    for (const s of plan.slots) {
      const row = await tx.slot.create({
        data: { tournamentId, index: s.index, label: s.label, stage: s.stage },
      });
      slotIds.set(s.index, row.id);
    }
    const matchIds = new Map<string, string>();
    const src = (s: PlanSource) => ({
      kind: s.kind,
      matchId: "matchKey" in s ? (matchIds.get(s.matchKey) ?? fail("Plan references a later match.")) : null,
      groupId: "groupKey" in s ? (groupIds.get(s.groupKey) ?? null) : null,
      rank: "rank" in s ? s.rank : null,
      teamId: s.kind === "TEAM" ? s.teamId : null,
    });
    const ordered = [...plan.matches].sort((a, b) => a.slotIndex - b.slotIndex || a.tableNo - b.tableNo);
    for (const m of ordered) {
      const a = src(m.sourceA);
      const b = src(m.sourceB);
      const row = await tx.match.create({
        data: {
          tournamentId,
          slotId: slotIds.get(m.slotIndex)!,
          tableNo: m.tableNo,
          groupId: m.groupKey ? groupIds.get(m.groupKey)! : null,
          teamAId: a.teamId,
          teamBId: b.teamId,
          sourceAKind: a.kind,
          sourceAMatchId: a.matchId,
          sourceAGroupId: a.groupId,
          sourceARank: a.rank,
          sourceBKind: b.kind,
          sourceBMatchId: b.matchId,
          sourceBGroupId: b.groupId,
          sourceBRank: b.rank,
        },
      });
      matchIds.set(m.key, row.id);
    }
    await tx.tournament.update({
      where: { id: tournamentId },
      data: {
        formatId,
        formatConfig: format as unknown as Prisma.InputJsonValue,
        drawSeed: seed,
        // A new draw is a different schedule, so it needs confirming again.
        ...(t.status === "READY" ? { status: "LOCKED" as const } : {}),
      },
    });
    await audit(tx, tournamentId, actorId, "plan.generate", {
      formatId,
      seed,
      groups: plan.groups.length,
      slots: plan.slots.length,
      matches: plan.matches.length,
    });
  });
  return { seed, plan };
}

export function formatOf(t: { formatConfig: unknown }): FormatConfig | null {
  return (t.formatConfig as FormatConfig | null) ?? null;
}

// ------------------------------------------------------------------ clock

export async function startSlot(slotId: string, actorId: string | null, now = new Date()) {
  const s = await prisma.slot.findUnique({ where: { id: slotId }, include: { tournament: true } });
  if (!s) fail("Round not found.");
  if (s!.startedAt && !s!.endedAt) fail("This round is already running.");
  const status = s!.tournament.status;
  if (status !== "READY" && status !== "RUNNING") {
    fail("Confirm the schedule before starting a round.");
  }
  await prisma.slot.update({ where: { id: slotId }, data: { startedAt: now, endedAt: null } });
  await prisma.tournament.updateMany({
    where: { id: s!.tournamentId, status: "READY" },
    data: { status: "RUNNING" },
  });
  await audit(prisma, s!.tournamentId, actorId, "slot.start", { slotId, index: s!.index, at: now.toISOString() });
}

export async function stopSlot(slotId: string, actorId: string | null, now = new Date()) {
  const s = await prisma.slot.findUnique({ where: { id: slotId } });
  if (!s) fail("Round not found.");
  if (!s!.startedAt) fail("This round hasn't started.");
  await prisma.slot.update({ where: { id: slotId }, data: { endedAt: now } });
  await audit(prisma, s!.tournamentId, actorId, "slot.stop", { slotId, index: s!.index, at: now.toISOString() });
  // Finish the tournament automatically when the last slot stops.
  const remaining = await prisma.slot.count({ where: { tournamentId: s!.tournamentId, endedAt: null } });
  if (remaining === 0) {
    await prisma.tournament.update({ where: { id: s!.tournamentId }, data: { status: "FINISHED" } });
  }
}

export async function updateSlot(slotId: string, patch: Prisma.SlotUpdateInput, actorId: string) {
  const s = await prisma.slot.findUnique({ where: { id: slotId } });
  if (!s) fail("Round not found.");
  await prisma.slot.update({ where: { id: slotId }, data: patch });
  await audit(prisma, s!.tournamentId, actorId, "slot.update", { slotId, ...(patch as object) } as Prisma.InputJsonValue);
}

/**
 * Stretch or shorten a live timer without opening the round's settings: the
 * game clock is the running round's length, the break clock is the break
 * after the round that was just stopped. Either way it lands on that round's
 * own override, so the rest of the plan keeps its numbers.
 */
export async function nudgeSlotClock(
  slotId: string,
  timer: "game" | "break",
  deltaSec: number,
  actorId: string,
) {
  const s = await prisma.slot.findUnique({
    where: { id: slotId },
    include: { tournament: { include: { slots: true } } },
  });
  if (!s) fail("Round not found.");
  const own = slotInputs(s!.tournament, s!.tournament.slots).find((x) => x.index === s!.index)!;
  const patch: Prisma.SlotUpdateInput =
    timer === "game"
      ? { durationSecOverride: Math.max(60, own.durationSec + deltaSec) }
      : { breakAfterSecOverride: Math.max(0, own.breakAfterSec + deltaSec) };
  await prisma.slot.update({ where: { id: slotId }, data: patch });
  await audit(prisma, s!.tournamentId, actorId, "slot.nudge", { slotId, timer, deltaSec });
}

export interface ClockTournament {
  gameDurationSec: number;
  breakDurationSec: number;
  stageTiming?: unknown;
}

/**
 * Slot durations for the projection: the slot's own override first, then the
 * stage clock, then the tournament defaults.
 */
export function slotInputs(
  t: ClockTournament,
  slots: Array<{
    index: number;
    stage: Stage;
    startedAt: Date | null;
    endedAt: Date | null;
    durationSecOverride: number | null;
    breakAfterSecOverride: number | null;
    plannedStartOverride: Date | null;
  }>,
): SlotInput[] {
  const byStage = slotTimings(slots, parseStageTiming(t.stageTiming), t);
  return slots.map((s) => {
    const staged = byStage.get(s.index)!;
    return {
      index: s.index,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      durationSec: s.durationSecOverride ?? staged.durationSec,
      breakAfterSec: s.breakAfterSecOverride ?? staged.breakAfterSec,
      plannedStartOverride: s.plannedStartOverride,
    };
  });
}

/**
 * Replace the per-stage clock. Values are minutes-as-seconds already; an entry
 * that matches the tournament default is simply left out by pruneStageTiming,
 * so "reset to default" is expressed by clearing the field.
 */
export async function setStageTiming(tournamentId: string, map: StageTimingMap, actorId: string) {
  const pruned = pruneStageTiming(map);
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { stageTiming: pruned === null ? Prisma.DbNull : (pruned as Prisma.InputJsonValue) },
  });
  await audit(prisma, tournamentId, actorId, "tournament.stageTiming", (pruned ?? {}) as Prisma.InputJsonValue);
}

export function projectionByIndex(
  t: ClockTournament & { startsAt: Date },
  slots: Parameters<typeof slotInputs>[1],
  now: Date,
): Map<number, SlotProjection> {
  const p = projectSchedule(t.startsAt, slotInputs(t, slots), now);
  return new Map(p.map((x) => [x.index, x]));
}

// ----------------------------------------------------------------- scores

/** Load everything resolveSources needs and apply its updates. Returns outOfSync ids. */
export async function runResolve(tx: Db, tournamentId: string): Promise<string[]> {
  const t = await getTournament(tx, tournamentId);
  const format = formatOf(t);
  const [matches, groups] = await Promise.all([
    tx.match.findMany({ where: { tournamentId }, include: { slot: { select: { index: true, startedAt: true } } } }),
    tx.group.findMany({ where: { tournamentId }, include: { teams: { select: { id: true, name: true } } } }),
  ]);
  const rows: ResolvableMatch[] = matches.map((m) => ({
    id: m.id,
    slotIndex: m.slot.index,
    status: m.status,
    slotStarted: m.slot.startedAt !== null,
    groupId: m.groupId,
    teamAId: m.teamAId,
    teamBId: m.teamBId,
    scoreA: m.scoreA,
    scoreB: m.scoreB,
    sourceAKind: m.sourceAKind,
    sourceAMatchId: m.sourceAMatchId,
    sourceAGroupId: m.sourceAGroupId,
    sourceARank: m.sourceARank,
    sourceBKind: m.sourceBKind,
    sourceBMatchId: m.sourceBMatchId,
    sourceBGroupId: m.sourceBGroupId,
    sourceBRank: m.sourceBRank,
  }));
  const result = resolveSources({
    matches: rows,
    groups: groups.map((g) => ({ id: g.id, teams: g.teams })),
    rules: t,
    wildcardPosition: (format?.advancePerGroup ?? 0) + 1,
  });
  for (const u of result.updates) {
    await tx.match.update({ where: { id: u.id }, data: { teamAId: u.teamAId, teamBId: u.teamBId } });
  }
  return result.outOfSync;
}

export interface ReportInput {
  scoreA: number;
  scoreB: number;
  reportedBy?: string | null;
  /** Team token when reporting from a team page. */
  teamToken?: string | null;
}

export async function submitScoreReport(matchId: string, input: ReportInput) {
  const m = await prisma.match.findUnique({
    where: { id: matchId },
    include: { slot: true, tournament: true },
  });
  if (!m) fail("Match not found.");
  const match = m!;
  if (!Number.isInteger(input.scoreA) || !Number.isInteger(input.scoreB) || input.scoreA < 0 || input.scoreB < 0) {
    fail("Scores must be whole numbers ≥ 0.");
  }
  if (input.scoreA === input.scoreB && !match.tournament.allowDraws) fail("Draws are not allowed in this tournament.");
  if (match.status === "CONFIRMED") fail("This match is already confirmed.");
  if (match.status === "VOID") fail("This match was voided.");
  if (!match.teamAId || !match.teamBId) fail("Teams for this match aren't decided yet.");
  // A round that is over still takes results — someone has to be able to type
  // in the score of a game that nobody got round to entering while it ran.
  if (!match.slot.startedAt && !match.slot.endedAt) fail("This round hasn't started yet.");

  let reportedForTeamId: string | null = null;
  if (input.teamToken) {
    const team = await prisma.team.findUnique({ where: { token: input.teamToken } });
    if (!team || (team.id !== match.teamAId && team.id !== match.teamBId)) fail("Invalid team link for this match.");
    reportedForTeamId = team!.id;
  } else if (!match.tournament.openScoring) {
    fail("Only teams can submit scores via their team link.");
  }

  await prisma.$transaction([
    prisma.scoreReport.create({
      data: {
        matchId,
        scoreA: input.scoreA,
        scoreB: input.scoreB,
        reportedBy: input.reportedBy?.trim() || null,
        reportedForTeamId,
      },
    }),
    prisma.match.update({ where: { id: matchId }, data: { status: "REPORTED" } }),
  ]);
}

/** Admin confirms a result. Runs resolution in the same transaction. */
export async function confirmMatch(matchId: string, scoreA: number, scoreB: number, actorId: string | null) {
  const m = await prisma.match.findUnique({ where: { id: matchId }, include: { tournament: true } });
  if (!m) fail("Match not found.");
  const match = m!;
  if (!match.teamAId || !match.teamBId) fail("Teams for this match aren't decided yet.");
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) fail("Scores must be whole numbers ≥ 0.");
  if (scoreA === scoreB && !match.tournament.allowDraws) fail("Draws are not allowed in this tournament.");

  return prisma.$transaction(async (tx) => {
    await tx.match.update({
      where: { id: matchId },
      data: { scoreA, scoreB, status: "CONFIRMED", confirmedAt: new Date(), confirmedById: actorId },
    });
    const outOfSync = await runResolve(tx, match.tournamentId);
    await audit(tx, match.tournamentId, actorId, "match.confirm", { matchId, scoreA, scoreB, outOfSync });
    return outOfSync;
  });
}

export async function voidMatch(matchId: string, actorId: string, note?: string) {
  const m = await prisma.match.findUnique({ where: { id: matchId } });
  if (!m) fail("Match not found.");
  return prisma.$transaction(async (tx) => {
    await tx.match.update({ where: { id: matchId }, data: { status: "VOID", note: note ?? m!.note } });
    const outOfSync = await runResolve(tx, m!.tournamentId);
    await audit(tx, m!.tournamentId, actorId, "match.void", { matchId, outOfSync });
    return outOfSync;
  });
}

/** Partial admin edit of a match (scores, teams, table, status, note). Re-resolves. */
/** Plain value out of a Prisma update field, which may be `{ set: value }`. */
function patched<T>(patch: Record<string, unknown>, key: string, current: T): T {
  if (!(key in patch)) return current;
  const v = patch[key];
  if (v !== null && typeof v === "object" && "set" in (v as object)) {
    return (v as { set: T }).set;
  }
  return v as T;
}

export async function updateMatch(matchId: string, patch: Prisma.MatchUncheckedUpdateInput, actorId: string) {
  const m = await prisma.match.findUnique({ where: { id: matchId }, include: { tournament: true } });
  if (!m) fail("Match not found.");

  // confirmMatch validates; this one used to write the patch verbatim, so a
  // match could be marked CONFIRMED with a blank score. That reads as settled
  // everywhere but resolves to nothing: it is skipped by the standings and by
  // resolveSources, so a knockout silently stalls. Validate the *merged*
  // state, not just the patch.
  const raw = patch as Record<string, unknown>;
  const next = {
    status: patched(raw, "status", m!.status),
    scoreA: patched<number | null>(raw, "scoreA", m!.scoreA),
    scoreB: patched<number | null>(raw, "scoreB", m!.scoreB),
    teamAId: patched<string | null>(raw, "teamAId", m!.teamAId),
    teamBId: patched<string | null>(raw, "teamBId", m!.teamBId),
  };
  if (next.status === "CONFIRMED") {
    if (!next.teamAId || !next.teamBId) fail("A confirmed match needs both teams.");
    const { scoreA, scoreB } = next;
    const whole = (n: number | null): n is number => Number.isInteger(n) && (n as number) >= 0;
    if (!whole(scoreA) || !whole(scoreB)) fail("A confirmed match needs both scores as whole numbers ≥ 0.");
    if (scoreA === scoreB && !m!.tournament.allowDraws) fail("Draws are not allowed in this tournament.");
  }

  return prisma.$transaction(async (tx) => {
    // Pinning teams by hand turns the source into a fixed TEAM.
    if ("teamAId" in patch) Object.assign(patch, { sourceAKind: "TEAM", sourceAMatchId: null, sourceAGroupId: null, sourceARank: null });
    if ("teamBId" in patch) Object.assign(patch, { sourceBKind: "TEAM", sourceBMatchId: null, sourceBGroupId: null, sourceBRank: null });
    await tx.match.update({ where: { id: matchId }, data: patch });
    const outOfSync = await runResolve(tx, m!.tournamentId);
    await audit(tx, m!.tournamentId, actorId, "match.update", { matchId, ...(patch as object), outOfSync } as Prisma.InputJsonValue);
    return outOfSync;
  });
}

export async function createMatch(
  tournamentId: string,
  input: { slotId: string; tableNo: number; teamAId: string | null; teamBId: string | null; groupId?: string | null },
  actorId: string,
) {
  const slot = await prisma.slot.findUnique({ where: { id: input.slotId } });
  if (!slot || slot.tournamentId !== tournamentId) fail("Round not found.");
  const row = await prisma.match.create({
    data: {
      tournamentId,
      slotId: input.slotId,
      tableNo: input.tableNo,
      teamAId: input.teamAId,
      teamBId: input.teamBId,
      groupId: input.groupId ?? null,
    },
  });
  await audit(prisma, tournamentId, actorId, "match.create", { matchId: row.id, ...input });
  return row;
}

export async function deleteMatch(matchId: string, actorId: string) {
  const m = await prisma.match.findUnique({ where: { id: matchId } });
  if (!m) fail("Match not found.");
  const dependents = await prisma.match.count({
    where: { OR: [{ sourceAMatchId: matchId }, { sourceBMatchId: matchId }] },
  });
  if (dependents > 0) fail("Other matches depend on this one. Void it instead.");
  await prisma.match.delete({ where: { id: matchId } });
  await audit(prisma, m!.tournamentId, actorId, "match.delete", { matchId });
}

export async function createSlot(
  tournamentId: string,
  input: { label: string; stage: Stage; afterIndex: number | null },
  actorId: string,
) {
  return prisma.$transaction(async (tx) => {
    const slots = await tx.slot.findMany({ where: { tournamentId }, orderBy: { index: "asc" } });
    const at = input.afterIndex === null ? slots.length : input.afterIndex + 1;
    // Shift later slots up by one, highest first to keep the unique index.
    for (const s of [...slots].reverse()) {
      if (s.index >= at) await tx.slot.update({ where: { id: s.id }, data: { index: s.index + 1 } });
    }
    const row = await tx.slot.create({ data: { tournamentId, index: at, label: input.label, stage: input.stage } });
    await audit(tx, tournamentId, actorId, "slot.create", { slotId: row.id, index: at });
    return row;
  });
}

export async function deleteSlot(slotId: string, actorId: string) {
  const s = await prisma.slot.findUnique({ where: { id: slotId }, include: { matches: true } });
  if (!s) fail("Round not found.");
  if (s!.matches.length > 0) fail("Delete or move this round's matches first.");
  await prisma.$transaction(async (tx) => {
    await tx.slot.delete({ where: { id: slotId } });
    const later = await tx.slot.findMany({ where: { tournamentId: s!.tournamentId, index: { gt: s!.index } }, orderBy: { index: "asc" } });
    for (const l of later) await tx.slot.update({ where: { id: l.id }, data: { index: l.index - 1 } });
    await audit(tx, s!.tournamentId, actorId, "slot.delete", { slotId });
  });
}

/**
 * Re-pack the rounds that have not started yet, filling every table.
 *
 * For a tournament planned before packGroupStage existed — or one whose field
 * changed after the draw — the group stage can sit in more rounds than the
 * tables require. This moves the *unplayed* group fixtures onto fewer rounds
 * and deletes the rounds left empty.
 *
 * Deliberately conservative, because it is meant to be safe to press during a
 * live tournament:
 *   - the draw is untouched; no team changes group and no fixture changes
 *     opponent, only which round and table it sits on
 *   - a round that has started, or holds any result, is frozen — and so is
 *     everything before it
 *   - knockout rounds are left alone entirely: their matches are referenced by
 *     id as "winner of…", and they cannot be packed anyway
 * Match rows are moved, never recreated, so every existing id survives.
 * `actorId` is only written to the audit log — a dry run never writes at all.
 */
export async function repackUpcomingRounds(tournamentId: string, actorId: string, opts: { dryRun?: boolean } = {}) {
  const t = await getTournament(prisma, tournamentId);
  const slots = await prisma.slot.findMany({
    where: { tournamentId },
    orderBy: { index: "asc" },
    include: { matches: true },
  });

  // A round is frozen once it has started or holds any result — and so is
  // everything before it, so a fixture can never jump in front of a round that
  // is already under way. Stage plays no part here: a knockout round simply
  // never joins the packing below.
  const frozen = (s: (typeof slots)[number]) =>
    s.startedAt !== null || s.endedAt !== null || s.matches.some((m) => m.status !== "SCHEDULED");

  let firstMovable = 0;
  slots.forEach((s, i) => {
    if (frozen(s)) firstMovable = i + 1;
  });
  const movable = slots
    .slice(firstMovable)
    .filter((s) => s.stage === "GROUP" && s.matches.every((m) => m.teamAId && m.teamBId));
  if (movable.length === 0) return { moved: 0, slotsBefore: 0, slotsAfter: 0, removed: 0 };

  const fixtures = movable.flatMap((s) =>
    s.matches.map((m) => ({
      id: m.id,
      groupKey: m.groupId ?? "—",
      // Its current round is its preferred order; packing only pulls a fixture
      // forward when a table would otherwise stand empty.
      round: s.index,
      teamAId: m.teamAId!,
      teamBId: m.teamBId!,
    })),
  );

  const packed = packGroupStage(fixtures, t.tableCount);
  if (packed.length > movable.length) fail("Re-packing would need more rounds than there are.");

  const keep = movable.slice(0, packed.length);
  const drop = movable.slice(packed.length);
  // A fixture counts as moved when its round or its table changes.
  const placeNow = new Map(
    movable.flatMap((s) => s.matches.map((m) => [m.id, `${s.id}:${m.tableNo}`] as const)),
  );
  const moved = packed.reduce(
    (n, slotFixtures, si) =>
      n + slotFixtures.filter((f, ti) => placeNow.get(f.id) !== `${keep[si]!.id}:${ti + 1}`).length,
    0,
  );

  const result = {
    moved,
    slotsBefore: movable.length,
    slotsAfter: packed.length,
    removed: drop.length,
  };
  if (opts.dryRun) return result;

  await prisma.$transaction(async (tx) => {
    // Two passes: (slotId, tableNo) is unique, so park every moving match on a
    // table number nothing else can hold before writing the real ones.
    let parking = 1000;
    for (const f of fixtures) {
      await tx.match.update({ where: { id: f.id }, data: { tableNo: parking++ } });
    }
    for (const [si, slotFixtures] of packed.entries()) {
      for (const [ti, f] of slotFixtures.entries()) {
        await tx.match.update({ where: { id: f.id }, data: { slotId: keep[si]!.id, tableNo: ti + 1 } });
      }
    }
    // Renumber the labels of the rounds that moved; the frozen ones keep theirs.
    const frozenGroupRounds = slots.slice(0, firstMovable).filter((s) => s.stage === "GROUP").length;
    for (const [si, slot] of keep.entries()) {
      await tx.slot.update({ where: { id: slot.id }, data: { label: `Group round ${frozenGroupRounds + si + 1}` } });
    }
    for (const slot of drop) {
      await tx.slot.delete({ where: { id: slot.id } });
    }
    await audit(tx, tournamentId, actorId, "plan.repack", result);
  });

  return result;
}

/**
 * Replace the playoff without touching the group stage.
 *
 * Mid-tournament the draw cannot be re-run — regenerating wipes the groups and
 * every result with them — but the shape of the playoff is exactly the thing an
 * organiser wants to change once they see how the day is going: quarter-finals
 * or straight to the semis, places below played out or not.
 *
 * The group stage, its results and its rounds stay exactly as they are. Only
 * knockout rounds are replaced, and only while none of them has started.
 */
export async function replanPlayoff(
  tournamentId: string,
  config: FormatConfig,
  actorId: string,
) {
  const t = await getTournament(prisma, tournamentId);
  const [groups, slots, teams] = await Promise.all([
    prisma.group.findMany({ where: { tournamentId }, orderBy: { order: "asc" } }),
    prisma.slot.findMany({ where: { tournamentId }, orderBy: { index: "asc" }, include: { matches: true } }),
    confirmedTeamRefs(prisma, tournamentId),
  ]);
  if (groups.length === 0) fail("This tournament has no group stage to build a playoff on.");

  const knockout = slots.filter((s) => s.stage !== "GROUP");
  const started = knockout.filter(
    (s) => s.startedAt !== null || s.endedAt !== null || s.matches.some((m) => m.status !== "SCHEDULED"),
  );
  if (started.length > 0) fail("The playoff has already begun — it can't be re-planned now.");

  const problem = validateFormat(config, teams.length);
  if (problem) fail(problem);
  if (config.groupCount !== groups.length) {
    fail(`The draw has ${groups.length} groups; this format wants ${config.groupCount}.`);
  }

  // Build a fresh plan for the same field and read only its knockout off it —
  // the group stage it produces is thrown away, so the real one is untouched.
  const fresh = generatePlan(config, teams, t.tableCount, seededRng(t.drawSeed ?? 1));
  const keyToGroupId = new Map(fresh.groups.map((g, i) => [g.key, groups[i]!.id]));
  const freshKnockout = fresh.slots.filter((s) => s.stage !== "GROUP");
  const groupSlots = slots.filter((s) => s.stage === "GROUP");
  const baseIndex = Math.max(-1, ...groupSlots.map((s) => s.index)) + 1;

  await prisma.$transaction(async (tx) => {
    await tx.match.deleteMany({ where: { tournamentId, slotId: { in: knockout.map((s) => s.id) } } });
    await tx.slot.deleteMany({ where: { id: { in: knockout.map((s) => s.id) } } });

    const slotIds = new Map<number, string>();
    for (const [i, s] of freshKnockout.entries()) {
      const row = await tx.slot.create({
        data: { tournamentId, index: baseIndex + i, label: s.label, stage: s.stage },
      });
      slotIds.set(s.index, row.id);
    }

    const matchIds = new Map<string, string>();
    const src = (x: PlanSource) => ({
      kind: x.kind,
      matchId: "matchKey" in x ? (matchIds.get(x.matchKey) ?? fail("Playoff references a later match.")) : null,
      groupId: "groupKey" in x ? (keyToGroupId.get(x.groupKey) ?? null) : null,
      rank: "rank" in x ? x.rank : null,
      teamId: x.kind === "TEAM" ? x.teamId : null,
    });
    const ordered = fresh.matches
      .filter((m) => slotIds.has(m.slotIndex))
      .sort((a, b) => a.slotIndex - b.slotIndex || a.tableNo - b.tableNo);
    for (const m of ordered) {
      const a = src(m.sourceA);
      const b = src(m.sourceB);
      const row = await tx.match.create({
        data: {
          tournamentId,
          slotId: slotIds.get(m.slotIndex)!,
          tableNo: m.tableNo,
          teamAId: a.teamId,
          teamBId: b.teamId,
          sourceAKind: a.kind,
          sourceAMatchId: a.matchId,
          sourceAGroupId: a.groupId,
          sourceARank: a.rank,
          sourceBKind: b.kind,
          sourceBMatchId: b.matchId,
          sourceBGroupId: b.groupId,
          sourceBRank: b.rank,
        },
      });
      matchIds.set(m.key, row.id);
    }

    await tx.tournament.update({
      where: { id: tournamentId },
      data: { formatId: config.id, formatConfig: config as unknown as Prisma.InputJsonValue },
    });
    await audit(tx, tournamentId, actorId, "plan.replanPlayoff", {
      rounds: freshKnockout.length,
      matches: ordered.length,
      formatId: config.id,
    });
  });

  // Fill in anyone already decided by a finished group.
  await prisma.$transaction(async (tx) => {
    await runResolve(tx, tournamentId);
  });

  return { rounds: freshKnockout.length, matches: fresh.matches.length - fresh.matches.filter((m) => m.groupKey).length };
}

export async function resetPlan(tournamentId: string, actorId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.match.deleteMany({ where: { tournamentId } });
    await tx.slot.deleteMany({ where: { tournamentId } });
    await tx.group.deleteMany({ where: { tournamentId } });
    await tx.team.updateMany({ where: { tournamentId }, data: { groupId: null } });
    await tx.tournament.update({
      where: { id: tournamentId },
      data: { formatId: null, formatConfig: undefined, status: "LOCKED" },
    });
    await audit(tx, tournamentId, actorId, "plan.reset");
  });
}
