/**
 * Test-mode simulator. Every entry point re-reads the tournament and refuses
 * to run unless testMode is set in the DB — never trusts the caller.
 */
import { prisma } from "./prisma";
import { confirmedTeamRefs, confirmMatch, projectionByIndex, registerTeam, startSlot, stopSlot, submitScoreReport } from "./tournament";

export interface TickLog {
  at: string;
  text: string;
}

const ADJ = ["Thirsty", "Flying", "Lazy", "Golden", "Rowdy", "Silent", "Mighty", "Tiny", "Wobbly", "Lucky", "Spicy", "Frozen"];
const NOUN = ["Cups", "Pandas", "Otters", "Kings", "Ninjas", "Llamas", "Sharks", "Wizards", "Pirates", "Goats", "Foxes", "Bears"];
const FIRST = ["Ana", "Ben", "Cleo", "Dan", "Eli", "Fay", "Gus", "Hana", "Ivo", "Jo", "Kim", "Lou", "Max", "Nia", "Oli", "Pia"];

async function requireTestMode(tournamentId: string) {
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!t) throw new Error("Tournament not found.");
  if (!t.testMode) throw new Error("Simulator refused: this tournament is not in test mode.");
  return t;
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

export async function seedTeams(tournamentId: string, n: number, rng: () => number): Promise<TickLog[]> {
  const t = await requireTestMode(tournamentId);
  const log: TickLog[] = [];
  if (t.status === "DRAFT") {
    await prisma.tournament.update({ where: { id: tournamentId }, data: { status: "REGISTRATION" } });
    log.push({ at: new Date().toISOString(), text: "Opened registration" });
  }
  for (let i = 0; i < n; i++) {
    const name = await registerRandomTeam(tournamentId, rng);
    if (name) log.push({ at: new Date().toISOString(), text: `Registered ${name}` });
  }
  const r = await prisma.team.updateMany({ where: { tournamentId, status: "PENDING" }, data: { status: "CONFIRMED" } });
  log.push({ at: new Date().toISOString(), text: `Confirmed ${r.count} pending teams` });
  return log;
}

async function registerRandomTeam(tournamentId: string, rng: () => number): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const name = `${pick(ADJ, rng)} ${pick(NOUN, rng)}`;
    const members = [pick(FIRST, rng), pick(FIRST, rng)];
    try {
      await registerTeam(tournamentId, { name, members }, { ip: null, joinCode: null, bypassGates: true });
      return name;
    } catch {
      // duplicate name — try another
    }
  }
  return null;
}

export interface TickOptions {
  now: Date;
  rng: () => number;
  autoClock: boolean;
  autoConfirm: boolean;
}

export async function simulateTick(tournamentId: string, opts: TickOptions): Promise<TickLog[]> {
  const t = await requireTestMode(tournamentId);
  const { now, rng } = opts;
  const log: TickLog[] = [];
  const say = (text: string) => log.push({ at: now.toISOString(), text });

  if (t.status === "REGISTRATION") {
    if (rng() < 0.7) {
      const name = await registerRandomTeam(tournamentId, rng);
      if (name) say(`A team registered: ${name}`);
    } else say("Nobody registered this tick");
    return log;
  }
  if (t.status !== "LOCKED" && t.status !== "READY" && t.status !== "RUNNING") {
    say(`Nothing to simulate while ${t.status.toLowerCase()}`);
    return log;
  }

  const slots = await prisma.slot.findMany({ where: { tournamentId }, orderBy: { index: "asc" }, include: { matches: true } });
  const proj = projectionByIndex(t, slots, now);
  const running = slots.filter((s) => s.startedAt && !s.endedAt);

  // Players: report scores for running matches, occasionally conflicting.
  for (const s of running) {
    for (const m of s.matches) {
      if (!m.teamAId || !m.teamBId) continue;
      if (m.status === "SCHEDULED" && rng() < 0.45) {
        const [a, b] = plausibleScore(t.allowDraws, rng);
        await submitScoreReport(m.id, { scoreA: a, scoreB: b, reportedBy: pick(FIRST, rng), teamToken: null });
        say(`Table ${m.tableNo}: someone reported ${a}:${b}`);
      } else if (m.status === "REPORTED" && rng() < 0.15) {
        const reports = await prisma.scoreReport.count({ where: { matchId: m.id } });
        if (reports === 1) {
          const last = await prisma.scoreReport.findFirst({ where: { matchId: m.id }, orderBy: { createdAt: "desc" } });
          const a = last!.scoreA + (rng() < 0.5 ? 1 : -1);
          await submitScoreReport(m.id, { scoreA: Math.max(0, a), scoreB: last!.scoreB, reportedBy: pick(FIRST, rng), teamToken: null });
          say(`Table ${m.tableNo}: a conflicting report came in`);
        }
      }
    }
  }

  // Admin stand-in: confirm reported matches using the latest report.
  if (opts.autoConfirm) {
    for (const s of running) {
      for (const m of s.matches) {
        if (m.status !== "REPORTED" || rng() > 0.6) continue;
        const last = await prisma.scoreReport.findFirst({ where: { matchId: m.id }, orderBy: { createdAt: "desc" } });
        if (!last) continue;
        try {
          await confirmMatch(m.id, last.scoreA, last.scoreB, null);
          say(`Confirmed table ${m.tableNo}: ${last.scoreA}:${last.scoreB}`);
        } catch (e) {
          say(`Could not confirm table ${m.tableNo}: ${(e as Error).message}`);
        }
      }
    }
  }

  // Clock: stop finished rounds, start the next when its time arrives.
  if (opts.autoClock) {
    for (const s of running) {
      const fresh = await prisma.match.findMany({ where: { slotId: s.id } });
      const allDone = fresh.every((m) => m.status === "CONFIRMED" || m.status === "VOID" || !m.teamAId || !m.teamBId);
      const p = proj.get(s.index)!;
      const overBy = (now.getTime() - (s.startedAt!.getTime() + (s.durationSecOverride ?? t.gameDurationSec) * 1000)) / 1000;
      if (allDone || overBy > (s.durationSecOverride ?? t.gameDurationSec) * 0.5) {
        await stopSlot(s.id, null, now);
        say(`Stopped ${s.label}${allDone ? "" : " (over-ran, forced)"}${p.delaySec > 0 ? `, ${Math.round(p.delaySec / 60)} min late` : ""}`);
      }
    }
    const stillRunning = await prisma.slot.count({ where: { tournamentId, startedAt: { not: null }, endedAt: null } });
    if (stillRunning === 0) {
      const next = slots.find((s) => !s.startedAt);
      if (next) {
        const p = proj.get(next.index)!;
        if (p.projectedStart.getTime() <= now.getTime() + 1000) {
          await startSlot(next.id, null, now);
          say(`Started ${next.label}`);
        }
      }
    }
  }

  if (log.length === 0) say("Quiet tick");
  return log;
}

function plausibleScore(allowDraws: boolean, rng: () => number): [number, number] {
  const a = Math.floor(rng() * 11);
  let b = Math.floor(rng() * 11);
  if (!allowDraws && a === b) b = a === 10 ? 9 : a + 1;
  return [a, b];
}

/** Wipe teams, plan and reports; back to REGISTRATION. */
export async function resetTest(tournamentId: string): Promise<TickLog[]> {
  await requireTestMode(tournamentId);
  await prisma.$transaction([
    prisma.match.deleteMany({ where: { tournamentId } }),
    prisma.slot.deleteMany({ where: { tournamentId } }),
    prisma.group.deleteMany({ where: { tournamentId } }),
    prisma.team.deleteMany({ where: { tournamentId } }),
    prisma.registrationAttempt.deleteMany({ where: { tournamentId } }),
    prisma.auditLog.deleteMany({ where: { tournamentId } }),
    prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: "REGISTRATION", formatId: null, formatConfig: undefined, drawSeed: null },
    }),
  ]);
  return [{ at: new Date().toISOString(), text: "Reset: teams, plan and reports wiped; registration open" }];
}

export async function confirmedCount(tournamentId: string) {
  return (await confirmedTeamRefs(prisma, tournamentId)).length;
}
