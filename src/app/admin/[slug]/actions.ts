"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/admin-guard";
import type { Stage } from "@/lib/bracket";
import { prisma } from "@/lib/prisma";
import { seededRng, randomSeed } from "@/lib/rng";
import { customFormat, isCustom } from "@/lib/formats";
import { STAGES } from "@/lib/bracket";
import { parseStageTiming, type StageTimingMap } from "@/lib/stage-timing";
import * as sim from "@/lib/simulator";
import {
  confirmMatch,
  createMatch,
  createSlot,
  deleteMatch,
  deleteSlot,
  deleteTeam,
  deleteTournament,
  DomainError,
  formatOf,
  generateTournamentPlan,
  newJoinCode,
  nudgeSlotClock,
  resetPlan,
  setStageTiming,
  setTournamentStatus,
  type TournamentStatusName,
  startSlot,
  stopSlot,
  updateMatch,
  updateSlot,
  updateTeam,
  updateTournament,
  voidMatch,
} from "@/lib/tournament";
import type { ActionState } from "@/components/ActionForm";

type Handler = (fd: FormData, adminId: string) => Promise<string | void>;

/** Wrap a handler: auth, error → state, revalidate the tournament's pages. */
function action(handler: Handler) {
  return async (_prev: ActionState, fd: FormData): Promise<ActionState> => {
    const admin = await requireAdmin();
    const slug = str(fd, "slug");
    try {
      const ok = await handler(fd, admin.id);
      if (slug) {
        revalidatePath(`/admin/${slug}`, "layout");
        revalidatePath(`/t/${slug}`, "layout");
      }
      return ok ? { ok } : {};
    } catch (e) {
      if (e instanceof DomainError || e instanceof Error) return { error: e.message };
      return { error: "Something went wrong." };
    }
  };
}

const str = (fd: FormData, k: string) => (fd.has(k) ? String(fd.get(k) ?? "").trim() : undefined);
const num = (fd: FormData, k: string) => {
  const v = str(fd, k);
  if (v === undefined) return undefined;
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const date = (fd: FormData, k: string) => {
  const v = str(fd, k);
  if (v === undefined) return undefined;
  if (v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
/** Checkboxes only submit when checked, so callers list them in `_bools`. */
const bool = (fd: FormData, k: string) => {
  const listed = String(fd.get("_bools") ?? "").split(",").includes(k);
  if (!listed && !fd.has(k)) return undefined;
  return fd.get(k) === "on" || fd.get(k) === "true";
};
const need = <T,>(v: T | null | undefined, msg: string): T => {
  if (v === null || v === undefined) throw new DomainError(msg);
  return v;
};

async function tournamentId(fd: FormData) {
  const slug = need(str(fd, "slug"), "Missing tournament.");
  const t = await prisma.tournament.findUnique({ where: { slug }, select: { id: true } });
  return need(t, "Tournament not found.").id;
}

// ---------------------------------------------------------------- tournament

export const updateTournamentAction = action(async (fd, adminId) => {
  const id = await tournamentId(fd);
  const patch: Prisma.TournamentUpdateInput = {};
  const s = (k: keyof Prisma.TournamentUpdateInput) => {
    const v = str(fd, k);
    if (v !== undefined) Object.assign(patch, { [k]: v });
  };
  s("name");
  s("description");
  s("scoreLabel");
  s("theme");
  // Emblem artwork arrives as iconArt.<iconId> fields; store the lot, and let
  // parseIconArt drop anything that is not an http(s) url for a real emblem.
  const artEntries = [...fd.entries()].filter(([k]) => k.startsWith("iconArt."));
  if (artEntries.length > 0) {
    const art: Record<string, string> = {};
    for (const [k, v] of artEntries) {
      const url = String(v ?? "").trim();
      if (url) art[k.slice("iconArt.".length)] = url;
    }
    patch.iconArt = art;
  }
  const newSlug = str(fd, "newSlug");
  if (newSlug) patch.slug = newSlug;
  const startsAt = date(fd, "startsAt");
  if (startsAt) patch.startsAt = startsAt;
  const gameMin = num(fd, "gameMin");
  if (gameMin) patch.gameDurationSec = Math.round(gameMin * 60);
  const breakMin = num(fd, "breakMin");
  if (breakMin !== undefined && breakMin !== null) patch.breakDurationSec = Math.round(breakMin * 60);
  const tableCount = num(fd, "tableCount");
  if (tableCount) patch.tableCount = tableCount;
  const venueName = str(fd, "venueName");
  if (venueName !== undefined) patch.venueName = venueName || null;
  const venueImage = str(fd, "venueImageUrl");
  if (venueImage !== undefined) {
    // A board served over https cannot load an http image at all, so rejecting
    // it here beats a backdrop that silently never appears.
    if (venueImage && !/^https:\/\//i.test(venueImage)) {
      throw new DomainError("The venue backdrop must be an https:// image URL.");
    }
    patch.venueImageUrl = venueImage || null;
  }
  const labels = str(fd, "tableLabels");
  if (labels !== undefined) patch.tableLabels = labels.split(",").map((x) => x.trim()).filter(Boolean);
  for (const k of ["minTeamSize", "maxTeamSize"] as const) {
    const v = num(fd, k);
    if (v !== undefined && v !== null) patch[k] = v;
  }
  for (const k of ["pointsWin", "pointsDraw", "pointsLoss"] as const) {
    const v = num(fd, k);
    if (v !== undefined && v !== null) patch[k] = v;
  }
  for (const k of ["allowDraws", "testMode", "joinCodeEnabled", "openScoring", "manualRounds"] as const) {
    const v = bool(fd, k);
    if (v !== undefined) patch[k] = v;
  }
  await updateTournament(id, patch, adminId);
  return "Saved.";
});

export const setStatusAction = action(async (fd, adminId) => {
  const id = await tournamentId(fd);
  const status = need(str(fd, "status"), "Missing status.") as TournamentStatusName;
  await setTournamentStatus(id, status, adminId);
});

export const newJoinCodeAction = action(async (fd, adminId) => {
  const id = await tournamentId(fd);
  await updateTournament(id, { joinCode: newJoinCode() }, adminId);
});

export async function deleteTournamentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = await tournamentId(fd);
  if (str(fd, "confirmName") !== str(fd, "expectedName")) return { error: "Type the tournament name to confirm." };
  await deleteTournament(id, admin.id);
  revalidatePath("/admin");
  redirect("/admin");
}

// --------------------------------------------------------------------- teams

export const teamStatusAction = action(async (fd, adminId) => {
  const teamId = need(str(fd, "teamId"), "Missing team.");
  const status = need(str(fd, "status"), "Missing status.") as "PENDING" | "CONFIRMED" | "REJECTED";
  await updateTeam(teamId, { status }, adminId);
});

export const updateTeamAction = action(async (fd, adminId) => {
  const teamId = need(str(fd, "teamId"), "Missing team.");
  const patch: Prisma.TeamUpdateInput = {};
  const name = str(fd, "name");
  if (name) patch.name = name;
  const members = str(fd, "members");
  if (members !== undefined) patch.members = members.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
  const contact = str(fd, "contact");
  if (contact !== undefined) patch.contact = contact || null;
  const seed = num(fd, "seed");
  if (seed !== undefined) patch.seed = seed;
  const icon = str(fd, "icon");
  if (icon !== undefined) patch.icon = icon || null;
  await updateTeam(teamId, patch, adminId);
  return "Saved.";
});

export const deleteTeamAction = action(async (fd, adminId) => {
  await deleteTeam(need(str(fd, "teamId"), "Missing team."), adminId);
});

export const addTeamAction = action(async (fd, adminId) => {
  const id = await tournamentId(fd);
  const name = need(str(fd, "name"), "Team name?");
  const { newToken } = await import("@/lib/tournament");
  const team = await prisma.team.create({
    data: {
      tournamentId: id,
      name,
      members: (str(fd, "members") ?? "").split(/[\n,]/).map((x) => x.trim()).filter(Boolean),
      status: "CONFIRMED",
      token: newToken(),
    },
  });
  await prisma.auditLog.create({ data: { tournamentId: id, actorId: adminId, action: "team.add", detail: { teamId: team.id, name } } });
  return `Added ${name}.`;
});

// ---------------------------------------------------------------------- plan

export const generatePlanAction = action(async (fd, adminId) => {
  const id = await tournamentId(fd);
  const formatId = need(str(fd, "formatId"), "Pick a format.");
  const format = isCustom(formatId) ? await buildCustom(fd, id) : formatId;
  const seed = num(fd, "seed");
  const { seed: used } = await generateTournamentPlan(id, format, adminId, {
    seed: seed ?? undefined,
    force: bool(fd, "force") === true,
  });
  return `Plan generated (draw seed ${used}).`;
});

/** A hand-built format: the group layout and the playoff size are separate choices. */
async function buildCustom(fd: FormData, tournamentId: string) {
  const teamCount = await prisma.team.count({ where: { tournamentId, status: "CONFIRMED" } });
  return customFormat({
    teamCount,
    groupCount: need(num(fd, "groupCount"), "Pick a group layout."),
    playoffSize: need(num(fd, "playoffSize"), "Pick a playoff size."),
    thirdPlaceMatch: bool(fd, "thirdPlace") === true,
    elimination: str(fd, "elimination") === "DOUBLE" ? "DOUBLE" : "SINGLE",
  });
}

export const updateStageTimingAction = action(async (fd, adminId) => {
  const id = await tournamentId(fd);
  const map: StageTimingMap = parseStageTiming(
    await prisma.tournament.findUnique({ where: { id }, select: { stageTiming: true } }).then((t) => t?.stageTiming),
  );
  // Minutes in, seconds out; an empty box means "use the tournament default".
  for (const stage of STAGES) {
    for (const [field, key] of [
      ["gameSec", `game_${stage}`],
      ["breakSec", `break_${stage}`],
      ["breakAfterStageSec", `after_${stage}`],
    ] as const) {
      const min = num(fd, key);
      if (min === undefined) continue;
      const entry = { ...(map[stage] ?? {}) };
      if (min === null) delete entry[field];
      else entry[field] = Math.round(min * 60);
      map[stage] = entry;
    }
  }
  await setStageTiming(id, map, adminId);
  return "Stage timing saved.";
});

export const redrawAction = action(async (fd, adminId) => {
  const id = await tournamentId(fd);
  const t = await prisma.tournament.findUnique({ where: { id }, select: { formatId: true, formatConfig: true } });
  const formatId = need(t?.formatId, "No format chosen yet.");
  // A hand-built format has no preset to look up — re-draw the stored config.
  const format = isCustom(formatId) ? need(formatOf(t!), "This plan has no stored format.") : formatId;
  const { seed } = await generateTournamentPlan(id, format, adminId, { seed: randomSeed(), force: bool(fd, "force") === true });
  return `Re-drawn (seed ${seed}).`;
});

export const resetPlanAction = action(async (fd, adminId) => {
  await resetPlan(await tournamentId(fd), adminId);
  return "Plan removed.";
});

// --------------------------------------------------------------------- clock

export const startSlotAction = action(async (fd, adminId) => {
  await startSlot(need(str(fd, "slotId"), "Missing round."), adminId);
});

export const stopSlotAction = action(async (fd, adminId) => {
  await stopSlot(need(str(fd, "slotId"), "Missing round."), adminId);
});

export const nudgeClockAction = action(async (fd, adminId) => {
  const timer = str(fd, "timer") === "break" ? "break" : "game";
  const delta = need(num(fd, "deltaSec"), "Missing amount.");
  await nudgeSlotClock(need(str(fd, "slotId"), "Missing round."), timer, delta, adminId);
});

export const resetSlotClockAction = action(async (fd, adminId) => {
  await updateSlot(need(str(fd, "slotId"), "Missing round."), { startedAt: null, endedAt: null }, adminId);
  return "Clock reset.";
});

export const updateSlotAction = action(async (fd, adminId) => {
  const slotId = need(str(fd, "slotId"), "Missing round.");
  const patch: Prisma.SlotUpdateInput = {};
  const label = str(fd, "label");
  if (label) patch.label = label;
  const dur = num(fd, "durationMin");
  if (dur !== undefined) patch.durationSecOverride = dur === null ? null : Math.round(dur * 60);
  const brk = num(fd, "breakMin");
  if (brk !== undefined) patch.breakAfterSecOverride = brk === null ? null : Math.round(brk * 60);
  for (const k of ["plannedStartOverride", "startedAt", "endedAt"] as const) {
    const d = date(fd, k);
    if (d !== undefined) patch[k] = d;
  }
  await updateSlot(slotId, patch, adminId);
  return "Saved.";
});

export const createSlotAction = action(async (fd, adminId) => {
  const id = await tournamentId(fd);
  const after = num(fd, "afterIndex");
  await createSlot(
    id,
    {
      label: str(fd, "label") || "Extra round",
      stage: (str(fd, "stage") || "GROUP") as Stage,
      afterIndex: after ?? null,
    },
    adminId,
  );
  return "Round added.";
});

export const deleteSlotAction = action(async (fd, adminId) => {
  await deleteSlot(need(str(fd, "slotId"), "Missing round."), adminId);
});

// ------------------------------------------------------------------- matches

export const confirmMatchAction = action(async (fd, adminId) => {
  const matchId = need(str(fd, "matchId"), "Missing match.");
  const a = need(num(fd, "scoreA"), "Score A?");
  const b = need(num(fd, "scoreB"), "Score B?");
  const outOfSync = await confirmMatch(matchId, a, b, adminId);
  return outOfSync.length ? `Confirmed — ${outOfSync.length} downstream match(es) out of sync, check the schedule.` : "Confirmed.";
});

export const voidMatchAction = action(async (fd, adminId) => {
  const outOfSync = await voidMatch(need(str(fd, "matchId"), "Missing match."), adminId, str(fd, "note"));
  return outOfSync.length ? `Voided — ${outOfSync.length} downstream match(es) out of sync.` : "Voided.";
});

export const updateMatchAction = action(async (fd, adminId) => {
  const matchId = need(str(fd, "matchId"), "Missing match.");
  const patch: Prisma.MatchUncheckedUpdateInput = {};
  for (const k of ["teamAId", "teamBId"] as const) {
    const v = str(fd, k);
    if (v !== undefined) patch[k] = v || null;
  }
  const slotId = str(fd, "slotId");
  if (slotId) patch.slotId = slotId;
  const tableNo = num(fd, "tableNo");
  if (tableNo) patch.tableNo = tableNo;
  for (const k of ["scoreA", "scoreB"] as const) {
    const v = num(fd, k);
    if (v !== undefined) patch[k] = v;
  }
  const status = str(fd, "status");
  if (status) patch.status = status as "SCHEDULED" | "REPORTED" | "CONFIRMED" | "VOID";
  const note = str(fd, "note");
  if (note !== undefined) patch.note = note || null;
  const outOfSync = await updateMatch(matchId, patch, adminId);
  return outOfSync.length ? `Saved — ${outOfSync.length} downstream match(es) out of sync.` : "Saved.";
});

export const createMatchAction = action(async (fd, adminId) => {
  const id = await tournamentId(fd);
  await createMatch(
    id,
    {
      slotId: need(str(fd, "slotId"), "Missing round."),
      tableNo: need(num(fd, "tableNo"), "Table?"),
      teamAId: str(fd, "teamAId") || null,
      teamBId: str(fd, "teamBId") || null,
      groupId: str(fd, "groupId") || null,
    },
    adminId,
  );
  return "Match added.";
});

export const deleteMatchAction = action(async (fd, adminId) => {
  await deleteMatch(need(str(fd, "matchId"), "Missing match."), adminId);
});

// ----------------------------------------------------------------- simulator

export interface SimState extends ActionState {
  log?: sim.TickLog[];
}

async function simulate(fd: FormData, run: (id: string) => Promise<sim.TickLog[]>): Promise<SimState> {
  await requireAdmin();
  const slug = str(fd, "slug") ?? "";
  try {
    const id = await tournamentId(fd);
    const log = await run(id);
    revalidatePath(`/admin/${slug}`, "layout");
    revalidatePath(`/t/${slug}`, "layout");
    return { log };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Simulator error." };
  }
}

export async function simSeedAction(_prev: SimState, fd: FormData): Promise<SimState> {
  const n = Math.max(1, Math.min(32, Number(fd.get("n") || 12)));
  return simulate(fd, (id) => sim.seedTeams(id, n, seededRng(randomSeed())));
}

export async function simTickAction(_prev: SimState, fd: FormData): Promise<SimState> {
  return simulate(fd, (id) =>
    sim.simulateTick(id, {
      now: new Date(),
      rng: seededRng(randomSeed()),
      autoClock: fd.get("autoClock") === "on",
      autoConfirm: fd.get("autoConfirm") === "on",
    }),
  );
}

export async function simResetAction(_prev: SimState, fd: FormData): Promise<SimState> {
  return simulate(fd, (id) => sim.resetTest(id));
}
