import { notFound } from "next/navigation";
import { loadTournamentView, fmtDelay, type TournamentView, type ViewMatch, type ViewSlot } from "@/lib/view";
import LocalTime from "@/components/LocalTime";
import StatusBadge from "@/components/StatusBadge";
import ActionForm, { inputCls } from "@/components/ActionForm";
import { STAGES } from "@/lib/bracket";
import {
  createMatchAction,
  createSlotAction,
  deleteMatchAction,
  deleteSlotAction,
  resetSlotClockAction,
  startSlotAction,
  stopSlotAction,
  updateMatchAction,
  updateSlotAction,
  voidMatchAction,
} from "../actions";

const toLocal = (d: Date | null) => {
  if (!d) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};



const CARD = "rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";
const SUMMARY = "cursor-pointer list-none [&::-webkit-details-marker]:hidden";
const FIELD = "flex flex-col gap-1 text-xs text-zinc-500";

/** Round-state accent, used by the timeline and the round cards. */
const ACCENT: Record<string, { bar: string; ring: string }> = {
  running: { bar: "bg-emerald-500", ring: "ring-emerald-500/40" },
  done: { bar: "bg-zinc-300 dark:bg-zinc-700", ring: "ring-transparent" },
  upcoming: { bar: "bg-sky-200 dark:bg-sky-900", ring: "ring-transparent" },
};

export default async function SchedulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const v = await loadTournamentView(slug);
  if (!v) notFound();
  const teams = v.teams.filter((t) => t.status === "CONFIRMED").sort((a, b) => a.name.localeCompare(b.name));
  const last = v.slots[v.slots.length - 1];

  return (
    <main className="space-y-4">
      {v.slots.length > 0 && (
        <section className={`${CARD} p-4`}>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 className="font-semibold">Day plan</h2>
            <span className="text-sm text-zinc-500">
              <LocalTime iso={v.slots[0]!.projection.projectedStart.toISOString()} withDate /> –{" "}
              <LocalTime iso={last!.projection.projectedEnd.toISOString()} />
            </span>
            <span className="text-sm text-zinc-500">
              {v.slots.length} rounds · {v.matches.length} matches
            </span>
            {v.delaySec > 60 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                running {fmtDelay(v.delaySec)}
              </span>
            )}
          </div>
          <Timeline slots={v.slots} />
        </section>
      )}

      {v.slots.length === 0 && (
        <p className={`${CARD} p-4 text-sm text-zinc-500`}>
          No plan yet — generate one on the Format tab, or add rounds by hand below.
        </p>
      )}

      {v.slots.map((s) => {
        const p = s.projection;
        const ms = v.matches.filter((m) => m.slotId === s.id);
        const accent = ACCENT[p.state] ?? ACCENT.upcoming!;
        return (
          <section key={s.id} className={`${CARD} overflow-hidden ring-1 ${accent.ring}`}>
            <header className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
              <span className={`h-8 w-1 rounded-full ${accent.bar}`} aria-hidden="true" />
              <StatusBadge value={p.state} symbolOnly />
              <span className="font-semibold">
                <span className="text-zinc-400">#{s.index + 1}</span> {s.label}
              </span>
              <span className="text-xs uppercase tracking-wide text-zinc-400">{s.stage}</span>
              <span className="text-sm tabular-nums text-zinc-500">
                <LocalTime iso={p.projectedStart.toISOString()} /> – <LocalTime iso={p.projectedEnd.toISOString()} />
                {p.state !== "done" && Math.abs(p.delaySec) > 60 && (
                  <span className="ml-1 text-amber-600">({fmtDelay(p.delaySec)})</span>
                )}
              </span>
              <span className="text-sm text-zinc-400">{summarise(ms)}</span>
              <div className="ml-auto flex flex-wrap items-center gap-1">
                {p.state === "upcoming" && (
                  <ActionForm action={startSlotAction} hidden={{ slug, slotId: s.id }} submitLabel="▶ Start" inline />
                )}
                {p.state === "running" && (
                  <ActionForm action={stopSlotAction} hidden={{ slug, slotId: s.id }} submitLabel="■ Stop" variant="danger" inline />
                )}
              </div>
            </header>

            {ms.length > 0 && (
              <ul className="divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
                {[...ms]
                  .sort((a, b) => a.tableNo - b.tableNo)
                  .map((m) => (
                    <MatchRowEditor key={m.id} m={m} slug={slug} v={v} teams={teams} />
                  ))}
              </ul>
            )}

            <details className="border-t border-zinc-100 dark:border-zinc-800">
              <summary className={`${SUMMARY} px-3 py-2 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100`}>
                ⚙ Timing, label &amp; extra matches
              </summary>
              <div className="space-y-4 border-t border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
                <ActionForm action={updateSlotAction} hidden={{ slug, slotId: s.id }} submitLabel="Save round" variant="secondary" inline className="!items-end">
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
                      placeholder={String(v.gameDurationSec / 60)}
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
                      placeholder={String(v.breakDurationSec / 60)}
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
            </details>
          </section>
        );
      })}

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

      <p className="text-xs text-zinc-500">
        Times are derived: edit start/end/durations and the projection follows. Shown in your local zone; server clock skew is
        ignored for edits.
      </p>
    </main>
  );
}

/** Proportional strip of the whole day, one segment per round. */
function Timeline({ slots }: { slots: ViewSlot[] }) {
  return (
    <div className="mt-3 flex gap-0.5">
      {slots.map((s) => {
        const p = s.projection;
        const sec = Math.max(60, (p.projectedEnd.getTime() - p.projectedStart.getTime()) / 1000);
        const accent = ACCENT[p.state] ?? ACCENT.upcoming!;
        return (
          <div
            key={s.id}
            style={{ flexGrow: sec }}
            className="group/seg min-w-0 basis-0"
            title={`#${s.index + 1} ${s.label} — ${p.state}`}
          >
            <div className={`h-2 rounded-full ${accent.bar}`} />
            <div className="mt-1 truncate text-[10px] text-zinc-400">#{s.index + 1}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Compact, readable row; the full edit form lives behind the disclosure. */
function MatchRowEditor({
  m,
  slug,
  v,
  teams,
}: {
  m: ViewMatch;
  slug: string;
  v: TournamentView;
  teams: Array<{ id: string; name: string }>;
}) {
  const scored = m.scoreA !== null && m.scoreB !== null;
  const aWon = scored && m.status === "CONFIRMED" && m.scoreA! > m.scoreB!;
  const bWon = scored && m.status === "CONFIRMED" && m.scoreB! > m.scoreA!;
  const dim = m.status === "VOID" ? "line-through opacity-50" : "";

  return (
    <li>
      <details className="group">
        <summary className={`${SUMMARY} flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/50`}>
          <span className="w-20 shrink-0 text-xs text-zinc-400">{v.tableLabel(m.tableNo)}</span>
          <span className={`flex min-w-0 flex-1 items-center justify-end gap-2 ${dim}`}>
            <span className={`min-w-0 flex-1 truncate text-right ${aWon ? "font-semibold" : ""} ${m.teamAId ? "" : "text-zinc-400"}`}>
              {m.labelA}
            </span>
            <span className="shrink-0 rounded bg-zinc-100 px-2 py-0.5 font-mono text-xs tabular-nums dark:bg-zinc-800">
              {scored ? `${m.scoreA} : ${m.scoreB}` : "vs"}
            </span>
            <span className={`min-w-0 flex-1 truncate ${bWon ? "font-semibold" : ""} ${m.teamBId ? "" : "text-zinc-400"}`}>
              {m.labelB}
            </span>
          </span>
          {m.groupName && <span className="text-xs text-zinc-400">{m.groupName}</span>}
          <StatusBadge value={m.status} symbolOnly />
          <span className="text-xs text-zinc-400 group-open:hidden">edit ▾</span>
          <span className="hidden text-xs text-zinc-400 group-open:inline">close ▴</span>
        </summary>

        <div className="space-y-3 border-t border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
          {m.note && <p className="text-xs text-amber-600">note: {m.note}</p>}
          <ActionForm action={updateMatchAction} hidden={{ slug, matchId: m.id }} submitLabel="Save" variant="secondary" inline className="!items-end">
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
              Score
              <span className="flex items-center gap-1">
                <input name="scoreA" type="number" min={0} defaultValue={m.scoreA ?? ""} className={`${inputCls} w-14`} />:
                <input name="scoreB" type="number" min={0} defaultValue={m.scoreB ?? ""} className={`${inputCls} w-14`} />
              </span>
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
          <div className="flex gap-1 border-t border-zinc-200 pt-2 dark:border-zinc-800">
            {m.status !== "VOID" && (
              <ActionForm action={voidMatchAction} hidden={{ slug, matchId: m.id }} submitLabel="Void" variant="ghost" inline />
            )}
            <ActionForm action={deleteMatchAction} hidden={{ slug, matchId: m.id }} submitLabel="Delete" variant="ghost" inline />
          </div>
        </div>
      </details>
    </li>
  );
}

/** "3/4 confirmed" — enough to know whether a round can be closed. */
function summarise(ms: ViewMatch[]): string {
  if (ms.length === 0) return "no matches";
  const done = ms.filter((m) => m.status === "CONFIRMED" || m.status === "VOID").length;
  const reported = ms.filter((m) => m.status === "REPORTED").length;
  return `${done}/${ms.length} settled${reported ? ` · ${reported} reported` : ""}`;
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
