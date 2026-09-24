import Link from "next/link";
import { notFound } from "next/navigation";
import { loadTournamentView, fmtDelay, type TournamentView, type ViewMatch, type ViewSlot } from "@/lib/view";
import LocalTime from "@/components/LocalTime";
import LocalDateTimeInput from "@/components/LocalDateTimeInput";
import StatusBadge from "@/components/StatusBadge";
import ActionForm from "@/components/ActionForm";
import { inputCls } from "@/components/ui";
import { STAGES, stageLabel } from "@/lib/bracket";
import { effectiveTiming, parseStageTiming, planDurationSec, slotTimings, stagesInOrder } from "@/lib/stage-timing";
import {
  confirmMatchAction,
  setStatusAction,
  createMatchAction,
  createSlotAction,
  deleteMatchAction,
  deleteSlotAction,
  resetSlotClockAction,
  startSlotAction,
  stopSlotAction,
  updateMatchAction,
  updateSlotAction,
  updateStageTimingAction,
  updateTournamentAction,
  voidMatchAction,
} from "../actions";

const toLocal = (d: Date | null) => {
  if (!d) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const CARD = "rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";
const FIELD = "flex flex-col gap-1 text-xs text-zinc-500";
/** The score boxes are the primary control now, so they must read as fields —
 *  the shared inputCls is transparent and near-invisible on a dark card. */
const SCORE =
  "w-16 rounded-lg border border-zinc-300 bg-zinc-100 px-2 py-1 text-center text-base font-semibold tabular-nums outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-zinc-600 dark:bg-zinc-800";

const LINK =
  "rounded px-1.5 py-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";

const ACCENT: Record<string, { bar: string; ring: string }> = {
  running: { bar: "bg-emerald-500", ring: "ring-emerald-500/40" },
  done: { bar: "bg-zinc-300 dark:bg-zinc-700", ring: "ring-transparent" },
  upcoming: { bar: "bg-sky-200 dark:bg-sky-900", ring: "ring-transparent" },
};

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);

  const v = await loadTournamentView(slug);
  if (!v) notFound();
  const teams = v.teams.filter((t) => t.status === "CONFIRMED").sort((a, b) => a.name.localeCompare(b.name));

  // A round is past once a later one has started — that is what ends a round
  // in the room, not the clock running out.
  const latestStarted = v.slots.reduce((max, s) => (s.startedAt ? Math.max(max, s.index) : max), -1);
  const played = v.slots.filter((s) => s.index < latestStarted);
  const current = v.slots.filter((s) => s.index >= latestStarted);
  const loose = played.reduce(
    (n, s) => n + v.matches.filter((m) => m.slotId === s.id && m.status !== "CONFIRMED" && m.status !== "VOID").length,
    0,
  );

  const ctx: Ctx = { v, slug, teams, editMatch: one("edit"), editRound: one("round") };

  return (
    <main className="space-y-6">
      {v.slots.length > 0 && (
        <section className={`${CARD} p-4`}>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 className="font-semibold">Day plan</h2>
            <span className="text-sm text-zinc-500">
              <LocalTime iso={v.slots[0]!.projection.projectedStart.toISOString()} withDate /> –{" "}
              <LocalTime iso={v.slots[v.slots.length - 1]!.projection.projectedEnd.toISOString()} />
            </span>
            {v.manualRounds && <span className="text-sm text-zinc-500">manual rounds — times follow your start and stop</span>}
            <span className="text-sm text-zinc-500">
              {v.slots.length} rounds · {v.matches.length} matches
            </span>
            {!v.manualRounds && v.delaySec > 60 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                running {fmtDelay(v.delaySec)}
              </span>
            )}
          </div>
          <Timeline slots={v.slots} />
          {/* The start only matters until something has been played. */}
          {!v.slots.some((x) => x.startedAt) && (
            <ActionForm action={updateTournamentAction} hidden={{ slug }} submitLabel="Set start" variant="secondary" inline className="mt-3 !items-center">
              <span className="text-xs text-zinc-500">Tournament starts</span>
              <LocalDateTimeInput name="startsAt" iso={v.startsAt.toISOString()} className={inputCls} required />
            </ActionForm>
          )}
        </section>
      )}

      {v.slots.length > 0 && <StageTiming v={v} slug={slug} />}

      {v.slots.length === 0 && (
        <p className={`${CARD} p-4 text-sm text-zinc-500`}>
          No plan yet — generate one on the Format tab, or add rounds by hand below.
        </p>
      )}

      {v.status === "LOCKED" && v.slots.length > 0 && (
        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-indigo-300 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/40">
          <div className="flex-1 text-sm">
            <p className="font-medium">This schedule isn&apos;t confirmed yet.</p>
            <p className="text-zinc-600 dark:text-zinc-400">
              Check the rounds below, then confirm — nothing can start until you do. Re-drawing the plan clears the
              confirmation.
            </p>
          </div>
          <ActionForm action={setStatusAction} hidden={{ slug, status: "READY" }} submitLabel="✓ Confirm schedule" inline />
        </section>
      )}

      {v.status === "READY" && (
        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-indigo-300 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/40">
          <p className="flex-1 text-sm">
            <span className="font-medium">Schedule confirmed.</span>{" "}
            <span className="text-zinc-600 dark:text-zinc-400">Start round 1 when everyone is at the tables.</span>
          </p>
          <ActionForm action={setStatusAction} hidden={{ slug, status: "LOCKED" }} submitLabel="Back to planning" variant="ghost" inline />
        </section>
      )}

      {current.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Now &amp; upcoming</h2>
          {current.map((s) => (
            <Round key={s.id} s={s} {...ctx} />
          ))}
        </div>
      )}

      {played.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-lg font-semibold text-zinc-500">Played</h2>
            {loose > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                {loose} still unsettled
              </span>
            )}
          </div>
          {played.map((s) => (
            <Round key={s.id} s={s} {...ctx} />
          ))}
        </div>
      )}

      <section className="rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
        <ActionForm action={createSlotAction} hidden={{ slug }} submitLabel="+ Add round" variant="secondary" inline>
          <input name="label" placeholder="Label" className={`${inputCls} w-40`} />
          <select name="stage" className={inputCls} defaultValue="GROUP">
            {STAGES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <label className="text-xs text-zinc-500">
            after round #
            <input name="afterIndex" type="number" min={0} placeholder="end" className={`${inputCls} ml-1 w-16`} />
          </label>
        </ActionForm>
      </section>
    </main>
  );
}

interface Ctx {
  v: TournamentView;
  slug: string;
  teams: Array<{ id: string; name: string }>;
  editMatch: string | null;
  editRound: string | null;
}

function Round({ s, ...c }: { s: ViewSlot } & Ctx) {
  const { v, slug, editRound } = c;
  const p = s.projection;
  const ms = v.matches.filter((m) => m.slotId === s.id).sort((a, b) => a.tableNo - b.tableNo);
  const accent = ACCENT[p.state] ?? ACCENT.upcoming!;
  const settled = ms.filter((m) => m.status === "CONFIRMED" || m.status === "VOID").length;
  const reported = ms.filter((m) => m.status === "REPORTED").length;
  const open = editRound === s.id;

  return (
    <section className={`${CARD} overflow-hidden ring-1 ${accent.ring}`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
        <span className={`h-8 w-1 rounded-full ${accent.bar}`} aria-hidden="true" />
        <StatusBadge value={p.state} symbolOnly />
        <span className="font-semibold">
          <span className="text-zinc-400">#{s.index + 1}</span> {s.label}
        </span>
        <span className="text-sm tabular-nums text-zinc-500">
          <LocalTime iso={p.projectedStart.toISOString()} /> – <LocalTime iso={p.projectedEnd.toISOString()} />
          {!v.manualRounds && p.state !== "done" && Math.abs(p.delaySec) > 60 && (
            <span className="ml-1 text-amber-600">({fmtDelay(p.delaySec)})</span>
          )}
        </span>
        <span className="text-sm text-zinc-400">
          {ms.length === 0 ? "no matches" : `${settled}/${ms.length} settled`}
          {reported > 0 && <span className="ml-1 font-medium text-sky-600">· {reported} to confirm</span>}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {p.state === "upcoming" && (v.status === "READY" || v.status === "RUNNING") && (
            <ActionForm action={startSlotAction} hidden={{ slug, slotId: s.id }} submitLabel="▶ Start" inline />
          )}
          {p.state === "running" && (
            <ActionForm action={stopSlotAction} hidden={{ slug, slotId: s.id }} submitLabel="■ Stop" variant="danger" inline />
          )}
          <Link href={open ? "?" : `?round=${s.id}`} scroll={false} className={LINK} aria-label="Round settings">
            {open ? "close ⚙" : "⚙"}
          </Link>
        </div>
      </header>

      {ms.length > 0 && (
        <ul className="divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
          {ms.map((m) => (
            <MatchLine key={m.id} m={m} {...c} />
          ))}
        </ul>
      )}

      {open && <RoundSettings s={s} ms={ms} {...c} />}
    </section>
  );
}

/**
 * One line per match with the two things that matter — score and status —
 * present and editable, no disclosure in the way.
 *
 * A reported score lives only in a ScoreReport row until an admin confirms it;
 * it is never written onto the match. So read it off the reports and pre-fill
 * the inputs: confirming what the players said is then a single click.
 */
function MatchLine({ m, v, slug, editMatch, teams }: { m: ViewMatch } & Ctx) {
  const latest = m.reports[0];
  const proposedA = m.scoreA ?? latest?.scoreA ?? "";
  const proposedB = m.scoreB ?? latest?.scoreB ?? "";
  const conflict = new Set(m.reports.map((r) => `${r.scoreA}:${r.scoreB}`)).size > 1;
  const ready = Boolean(m.teamAId && m.teamBId);
  const editing = editMatch === m.id;
  const settled = m.status === "CONFIRMED";
  const dim = m.status === "VOID" ? "line-through opacity-50" : "";

  return (
    <li className={m.status === "REPORTED" ? "bg-sky-50/60 dark:bg-sky-950/20" : ""}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
        <span className="w-16 shrink-0 text-xs text-zinc-400">{v.tableLabel(m.tableNo)}</span>

        {ready ? (
          <ActionForm
            action={confirmMatchAction}
            hidden={{ slug, matchId: m.id }}
            submitLabel={settled ? "Update" : "✓ Confirm"}
            variant={settled ? "secondary" : "primary"}
            inline
            className={`!flex flex-1 !items-center ${dim}`}
          >
            <span className="min-w-0 flex-1 truncate text-right text-sm font-medium">{m.labelA}</span>
            <input
              name="scoreA"
              type="number"
              min={0}
              defaultValue={proposedA}
              aria-label={`${m.labelA} score`}
              placeholder="–"
              className={SCORE}
            />
            <span className="text-zinc-400">:</span>
            <input
              name="scoreB"
              type="number"
              min={0}
              defaultValue={proposedB}
              aria-label={`${m.labelB} score`}
              placeholder="–"
              className={SCORE}
            />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.labelB}</span>
          </ActionForm>
        ) : (
          <span className="flex-1 truncate text-sm italic text-zinc-400">
            {m.labelA} vs {m.labelB}
          </span>
        )}

        <StatusBadge value={m.status} />
        {m.status !== "VOID" && (
          <ActionForm action={voidMatchAction} hidden={{ slug, matchId: m.id }} submitLabel="Void" variant="ghost" inline />
        )}
        <Link href={editing ? "?" : `?edit=${m.id}`} scroll={false} className={LINK}>
          {editing ? "close" : "edit"}
        </Link>
      </div>

      {m.reports.length > 0 && !settled && (
        <p className={`px-3 pb-2 text-xs ${conflict ? "text-amber-600" : "text-zinc-500"}`}>
          {conflict ? "⚠ conflicting reports: " : "reported: "}
          {m.reports.map((r, i) => (
            <span key={r.id}>
              {i > 0 && ", "}
              <span className="font-medium tabular-nums">
                {r.scoreA}:{r.scoreB}
              </span>
              {r.reportedBy ? ` (${r.reportedBy})` : ""}
            </span>
          ))}
          {conflict && " — newest is pre-filled above"}
        </p>
      )}
      {m.note && <p className="px-3 pb-2 text-xs text-amber-600">note: {m.note}</p>}

      {editing && (
        <div className="space-y-3 border-t border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
          <ActionForm
            action={updateMatchAction}
            hidden={{ slug, matchId: m.id }}
            submitLabel="Save"
            variant="secondary"
            inline
            className="!items-end"
          >
            <label className={FIELD}>
              Table
              <input name="tableNo" type="number" min={1} defaultValue={m.tableNo} className={`${inputCls} w-16`} />
            </label>
            <label className={FIELD}>
              {m.sourceAKind === "TEAM" ? "Team A" : `A: ${m.labelA}`}
              <TeamSelect name="teamAId" value={m.teamAId} teams={teams} />
            </label>
            <label className={FIELD}>
              {m.sourceBKind === "TEAM" ? "Team B" : `B: ${m.labelB}`}
              <TeamSelect name="teamBId" value={m.teamBId} teams={teams} />
            </label>
            <label className={FIELD}>
              Status
              <select name="status" defaultValue={m.status} className={inputCls}>
                {["SCHEDULED", "REPORTED", "CONFIRMED", "VOID"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className={FIELD}>
              Move to round
              <select name="slotId" defaultValue={m.slotId} className={`${inputCls} w-36`}>
                {v.slots.map((x) => (
                  <option key={x.id} value={x.id}>
                    #{x.index + 1} {x.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={FIELD}>
              Note
              <input name="note" defaultValue={m.note ?? ""} className={`${inputCls} w-32`} />
            </label>
          </ActionForm>
          <ActionForm action={deleteMatchAction} hidden={{ slug, matchId: m.id }} submitLabel="Delete match" variant="ghost" inline />
        </div>
      )}
    </li>
  );
}

function RoundSettings({ s, ms, v, slug, teams }: { s: ViewSlot; ms: ViewMatch[] } & Ctx) {
  const p = s.projection;
  // Placeholders show what this round would run at without an override, which
  // since stage timing exists is the stage's number, not the tournament's.
  const inherited = stageTimingsFor(v).get(s.index)!;
  return (
    <div className="space-y-4 border-t border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
      <ActionForm
        action={updateSlotAction}
        hidden={{ slug, slotId: s.id }}
        submitLabel="Save round"
        variant="secondary"
        inline
        className="!items-end"
      >
        <label className={FIELD}>
          Label
          <input name="label" defaultValue={s.label} className={`${inputCls} w-44`} />
        </label>
        <label className={FIELD}>
          Duration (min)
          <input
            name="durationMin"
            type="number"
            step="0.5"
            defaultValue={s.durationSecOverride ? s.durationSecOverride / 60 : ""}
            placeholder={String(Math.round((inherited.durationSec / 60) * 100) / 100)}
            className={`${inputCls} w-24`}
          />
        </label>
        <label className={FIELD}>
          Break after (min)
          <input
            name="breakMin"
            type="number"
            step="0.5"
            defaultValue={s.breakAfterSecOverride !== null ? s.breakAfterSecOverride / 60 : ""}
            placeholder={String(Math.round((inherited.breakAfterSec / 60) * 100) / 100)}
            className={`${inputCls} w-24`}
          />
        </label>
        <label className={FIELD}>
          Pin start
          <input name="plannedStartOverride" type="datetime-local" defaultValue={toLocal(s.plannedStartOverride)} className={inputCls} />
        </label>
        <label className={FIELD}>
          Started
          <input name="startedAt" type="datetime-local" defaultValue={toLocal(s.startedAt)} className={inputCls} />
        </label>
        <label className={FIELD}>
          Ended
          <input name="endedAt" type="datetime-local" defaultValue={toLocal(s.endedAt)} className={inputCls} />
        </label>
      </ActionForm>

      <div className="flex flex-wrap items-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <ActionForm action={createMatchAction} hidden={{ slug, slotId: s.id }} submitLabel="+ Add match" variant="secondary" inline>
          <label className={FIELD}>
            Table
            <input name="tableNo" type="number" min={1} defaultValue={ms.length + 1} className={`${inputCls} w-16`} />
          </label>
          <label className={FIELD}>
            Team A
            <TeamSelect name="teamAId" value={null} teams={teams} />
          </label>
          <label className={FIELD}>
            Team B
            <TeamSelect name="teamBId" value={null} teams={teams} />
          </label>
        </ActionForm>
        <span className="ml-auto flex gap-1">
          {p.state !== "upcoming" && (
            <ActionForm action={resetSlotClockAction} hidden={{ slug, slotId: s.id }} submitLabel="Reset clock" variant="ghost" inline />
          )}
          {ms.length === 0 && (
            <ActionForm action={deleteSlotAction} hidden={{ slug, slotId: s.id }} submitLabel="Delete round" variant="ghost" inline />
          )}
        </span>
      </div>
    </div>
  );
}

function Timeline({ slots }: { slots: ViewSlot[] }) {
  return (
    <div className="mt-3 flex gap-0.5">
      {slots.map((s) => {
        const p = s.projection;
        const sec = Math.max(60, (p.projectedEnd.getTime() - p.projectedStart.getTime()) / 1000);
        const accent = ACCENT[p.state] ?? ACCENT.upcoming!;
        return (
          <div key={s.id} style={{ flexGrow: sec }} className="min-w-0 basis-0" title={`#${s.index + 1} ${s.label} — ${p.state}`}>
            <div className={`h-2 rounded-full ${accent.bar}`} />
            <div className="mt-1 truncate text-[10px] text-zinc-400">#{s.index + 1}</div>
          </div>
        );
      })}
    </div>
  );
}

function TeamSelect({ name, value, teams }: { name: string; value: string | null; teams: Array<{ id: string; name: string }> }) {
  return (
    <select name={name} defaultValue={value ?? ""} className={`${inputCls} w-36`}>
      <option value="">— TBD —</option>
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

/** Stage clock per round, for the override placeholders. */
function stageTimingsFor(v: TournamentView) {
  return slotTimings(v.slots, parseStageTiming(v.stageTiming), v);
}

/**
 * Per-stage clock. Every box is optional: empty means "whatever the tournament
 * default says", which is what the placeholder shows. A single round that needs
 * its own length still overrides all of this from its ⚙ settings.
 */
function StageTiming({ v, slug }: { v: TournamentView; slug: string }) {
  const map = parseStageTiming(v.stageTiming);
  const stages = stagesInOrder(v.slots);
  const defaults = { gameDurationSec: v.gameDurationSec, breakDurationSec: v.breakDurationSec };
  const min = (sec: number) => String(Math.round((sec / 60) * 100) / 100);
  const total = planDurationSec(v.slots, map, defaults);

  return (
    <details className={`${CARD} p-4`}>
      <summary className="cursor-pointer font-semibold">
        Stage timing
        <span className="ml-2 text-sm font-normal text-zinc-500">
          {stages.map((st) => `${stageLabel(st)} ${min(effectiveTiming(map, st, defaults).gameSec)}′`).join(" · ")} ·{" "}
          {Math.round(total / 60)} min total
        </span>
      </summary>

      <ActionForm
        action={updateStageTimingAction}
        hidden={{ slug }}
        submitLabel="Save stage timing"
        pendingLabel="Saving…"
        className="mt-3"
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500">
              <th className="py-1 pr-2 font-medium">Stage</th>
              <th className="py-1 pr-2 font-medium">Game (min)</th>
              <th className="py-1 pr-2 font-medium">Break between rounds</th>
              <th className="py-1 font-medium">Break after this stage</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((st) => {
              const eff = effectiveTiming(map, st, defaults);
              const own = map[st] ?? {};
              const rounds = v.slots.filter((s) => s.stage === st).length;
              return (
                <tr key={st} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-1.5 pr-2">
                    <span className="font-medium">{stageLabel(st)}</span>
                    <span className="ml-1 text-xs text-zinc-500">
                      {rounds} {rounds === 1 ? "round" : "rounds"}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      name={`game_${st}`}
                      type="number"
                      step="0.5"
                      min={0.5}
                      defaultValue={own.gameSec === undefined ? "" : min(own.gameSec)}
                      placeholder={min(eff.gameSec)}
                      className={`${inputCls} w-20`}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      name={`break_${st}`}
                      type="number"
                      step="0.5"
                      min={0}
                      defaultValue={own.breakSec === undefined ? "" : min(own.breakSec)}
                      placeholder={min(eff.breakSec)}
                      disabled={rounds < 2}
                      className={`${inputCls} w-20 disabled:opacity-40`}
                    />
                  </td>
                  <td className="py-1.5">
                    <input
                      name={`after_${st}`}
                      type="number"
                      step="0.5"
                      min={0}
                      defaultValue={own.breakAfterStageSec === undefined ? "" : min(own.breakAfterStageSec)}
                      placeholder={min(eff.breakAfterStageSec)}
                      className={`${inputCls} w-20`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-xs text-zinc-500">
          Empty uses the tournament default ({Math.round(v.gameDurationSec / 60)} min games,{" "}
          {Math.round(v.breakDurationSec / 60)} min breaks, on the settings tab). The last column is the gap before the
          next stage starts — the one where teams are worked out and tables re-set.
        </p>
      </ActionForm>
    </details>
  );
}
