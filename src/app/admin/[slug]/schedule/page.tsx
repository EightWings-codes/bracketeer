import { notFound } from "next/navigation";
import { loadTournamentView, fmtDelay } from "@/lib/view";
import LocalTime from "@/components/LocalTime";
import StatusBadge from "@/components/StatusBadge";
import ActionForm, { inputCls } from "@/components/ActionForm";
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

export default async function SchedulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const v = await loadTournamentView(slug);
  if (!v) notFound();
  const teams = v.teams.filter((t) => t.status === "CONFIRMED").sort((a, b) => a.name.localeCompare(b.name));
  const STAGES = ["GROUP", "R16", "QUARTER", "SEMI", "THIRD", "FINAL"];

  return (
    <main className="space-y-4">
      <p className="text-sm text-zinc-500">
        Times are derived: edit start/end/durations here and the projection follows. Times shown in your local zone; server clock skew is ignored for edits.
      </p>
      {v.slots.length === 0 && <p className="text-zinc-500">No plan yet — generate one on the Format tab, or add rounds by hand below.</p>}

      {v.slots.map((s) => {
        const p = s.projection;
        const ms = v.matches.filter((m) => m.slotId === s.id);
        return (
          <section key={s.id} className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 p-3 dark:border-zinc-800">
              <StatusBadge value={p.state} />
              <span className="font-semibold">
                #{s.index + 1} {s.label}
              </span>
              <span className="text-sm text-zinc-500">
                <LocalTime iso={p.projectedStart.toISOString()} /> – <LocalTime iso={p.projectedEnd.toISOString()} />
                {p.state !== "done" && Math.abs(p.delaySec) > 60 && <span className="ml-1 text-amber-600">({fmtDelay(p.delaySec)})</span>}
              </span>
              <div className="ml-auto flex flex-wrap gap-1">
                {p.state === "upcoming" && <ActionForm action={startSlotAction} hidden={{ slug, slotId: s.id }} submitLabel="▶ Start" inline />}
                {p.state === "running" && <ActionForm action={stopSlotAction} hidden={{ slug, slotId: s.id }} submitLabel="■ Stop" variant="danger" inline />}
                {p.state !== "upcoming" && <ActionForm action={resetSlotClockAction} hidden={{ slug, slotId: s.id }} submitLabel="Reset clock" variant="ghost" inline />}
                {ms.length === 0 && <ActionForm action={deleteSlotAction} hidden={{ slug, slotId: s.id }} submitLabel="Delete round" variant="ghost" inline />}
              </div>
            </header>

            <div className="border-b border-zinc-100 p-3 dark:border-zinc-800">
              <ActionForm action={updateSlotAction} hidden={{ slug, slotId: s.id }} submitLabel="Save round" variant="secondary" inline>
                <label className="text-xs text-zinc-500">
                  Label
                  <input name="label" defaultValue={s.label} className={`${inputCls} block w-44`} />
                </label>
                <label className="text-xs text-zinc-500">
                  Duration (min)
                  <input name="durationMin" type="number" step="0.5" defaultValue={s.durationSecOverride ? s.durationSecOverride / 60 : ""} placeholder={String(v.gameDurationSec / 60)} className={`${inputCls} block w-24`} />
                </label>
                <label className="text-xs text-zinc-500">
                  Break after (min)
                  <input name="breakMin" type="number" step="0.5" defaultValue={s.breakAfterSecOverride !== null ? s.breakAfterSecOverride / 60 : ""} placeholder={String(v.breakDurationSec / 60)} className={`${inputCls} block w-24`} />
                </label>
                <label className="text-xs text-zinc-500">
                  Pin start
                  <input name="plannedStartOverride" type="datetime-local" defaultValue={toLocal(s.plannedStartOverride)} className={`${inputCls} block`} />
                </label>
                <label className="text-xs text-zinc-500">
                  Started
                  <input name="startedAt" type="datetime-local" defaultValue={toLocal(s.startedAt)} className={`${inputCls} block`} />
                </label>
                <label className="text-xs text-zinc-500">
                  Ended
                  <input name="endedAt" type="datetime-local" defaultValue={toLocal(s.endedAt)} className={`${inputCls} block`} />
                </label>
              </ActionForm>
            </div>

            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {ms.map((m) => (
                <li key={m.id} className="flex flex-wrap items-end gap-2 p-3 text-sm">
                  <StatusBadge value={m.status} className="mb-1.5" />
                  <ActionForm action={updateMatchAction} hidden={{ slug, matchId: m.id }} submitLabel="Save" variant="ghost" inline>
                    <label className="text-xs text-zinc-500">
                      Table
                      <input name="tableNo" type="number" min={1} defaultValue={m.tableNo} className={`${inputCls} block w-16`} />
                    </label>
                    <label className="text-xs text-zinc-500">
                      {m.sourceAKind === "TEAM" ? "Team A" : `A: ${m.labelA}`}
                      <TeamSelect name="teamAId" value={m.teamAId} teams={teams} />
                    </label>
                    <label className="text-xs text-zinc-500">
                      {m.sourceBKind === "TEAM" ? "Team B" : `B: ${m.labelB}`}
                      <TeamSelect name="teamBId" value={m.teamBId} teams={teams} />
                    </label>
                    <label className="text-xs text-zinc-500">
                      Score
                      <span className="flex items-center gap-1">
                        <input name="scoreA" type="number" min={0} defaultValue={m.scoreA ?? ""} className={`${inputCls} w-14`} />
                        :
                        <input name="scoreB" type="number" min={0} defaultValue={m.scoreB ?? ""} className={`${inputCls} w-14`} />
                      </span>
                    </label>
                    <label className="text-xs text-zinc-500">
                      Status
                      <select name="status" defaultValue={m.status} className={`${inputCls} block`}>
                        {["SCHEDULED", "REPORTED", "CONFIRMED", "VOID"].map((x) => <option key={x}>{x}</option>)}
                      </select>
                    </label>
                    <label className="text-xs text-zinc-500">
                      Move to round
                      <select name="slotId" defaultValue={m.slotId} className={`${inputCls} block w-36`}>
                        {v.slots.map((x) => <option key={x.id} value={x.id}>#{x.index + 1} {x.label}</option>)}
                      </select>
                    </label>
                    <label className="text-xs text-zinc-500">
                      Note
                      <input name="note" defaultValue={m.note ?? ""} className={`${inputCls} block w-32`} />
                    </label>
                  </ActionForm>
                  {m.status !== "VOID" && <ActionForm action={voidMatchAction} hidden={{ slug, matchId: m.id }} submitLabel="Void" variant="ghost" inline />}
                  <ActionForm action={deleteMatchAction} hidden={{ slug, matchId: m.id }} submitLabel="Delete" variant="ghost" inline />
                </li>
              ))}
              <li className="p-3">
                <ActionForm action={createMatchAction} hidden={{ slug, slotId: s.id }} submitLabel="+ Add match" variant="secondary" inline>
                  <input name="tableNo" type="number" min={1} defaultValue={ms.length + 1} className={`${inputCls} w-16`} aria-label="table" />
                  <TeamSelect name="teamAId" value={null} teams={teams} />
                  <TeamSelect name="teamBId" value={null} teams={teams} />
                </ActionForm>
              </li>
            </ul>
          </section>
        );
      })}

      <section className="rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
        <ActionForm action={createSlotAction} hidden={{ slug }} submitLabel="+ Add round" variant="secondary" inline>
          <input name="label" placeholder="Label" className={`${inputCls} w-40`} />
          <select name="stage" className={inputCls} defaultValue="GROUP">
            {STAGES.map((x) => <option key={x}>{x}</option>)}
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

function TeamSelect({ name, value, teams }: { name: string; value: string | null; teams: Array<{ id: string; name: string }> }) {
  return (
    <select name={name} defaultValue={value ?? ""} className={`${inputCls} block w-36`}>
      <option value="">— TBD —</option>
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
