/**
 * DB-facing domain logic. Every mutation lives here so server actions stay
 * thin. Authority is re-checked against the DB (status, testMode, tokens)
 * rather than trusting the caller.
 */
import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { APP } from "./config";
import { generatePlan, type PlanSource, type Stage, type TeamRef } from "./bracket";
import { findPreset, type FormatConfig } from "./formats";
import { randomSeed, seededRng } from "./rng";
import { normaliseMembers, rosterProblem, sizeBoundsProblem } from "./roster";
import { resolveSources, type ResolvableMatch } from "./resolve";
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
  minTeamSize?: number;
  maxTeamSize?: number;
  manualRounds?: boolean;
  testMode?: boolean;
  joinCodeEnabled?: boolean;
  openScoring?: boolean;
}

export async function createTournament(input: TournamentInput, actorId: string) {
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
      allowDraws: input.allowDraws ?? false,
      scoreLabel: input.scoreLabel ?? "Points",
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

  const team = await prisma.team.create({
    data: { tournamentId, name, members, contact: input.contact ?? null, token: newToken() },
  });
  await audit(prisma, tournamentId, null, "team.register", { teamId: team.id, name });
  return team;
}

export async function updateTeam(teamId: string, patch: Prisma.TeamUpdateInput, actorId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) fail("Team not found.");
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
  formatId: string,
  actorId: string,
  opts: { seed?: number; force?: boolean } = {},
) {
  const t = await getTournament(prisma, tournamentId);
  if (t.status !== "LOCKED" && t.status !== "READY" && t.status !== "RUNNING") {
    fail("Lock the field before generating a plan.");
  }
  const format = findPreset(formatId) ?? fail("Unknown format.");
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

export function slotInputs(
  t: { gameDurationSec: number; breakDurationSec: number },
  slots: Array<{
    index: number;
    startedAt: Date | null;
    endedAt: Date | null;
    durationSecOverride: number | null;
    breakAfterSecOverride: number | null;
    plannedStartOverride: Date | null;
  }>,
): SlotInput[] {
  return slots.map((s) => ({
    index: s.index,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    durationSec: s.durationSecOverride ?? t.gameDurationSec,
    breakAfterSec: s.breakAfterSecOverride ?? t.breakDurationSec,
    plannedStartOverride: s.plannedStartOverride,
  }));
}

export function projectionByIndex(
  t: { startsAt: Date; gameDurationSec: number; breakDurationSec: number },
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
  if (!match.slot.startedAt) fail("This round hasn't started yet.");

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
export async function updateMatch(matchId: string, patch: Prisma.MatchUncheckedUpdateInput, actorId: string) {
  const m = await prisma.match.findUnique({ where: { id: matchId } });
  if (!m) fail("Match not found.");
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
