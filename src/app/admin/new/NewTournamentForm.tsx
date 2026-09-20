"use client";

import ActionForm, { inputCls } from "@/components/ActionForm";
import { createTournamentAction } from "../actions";

export default function NewTournamentForm() {
  const defaultStart = new Date(Date.now() + 7 * 86400000);
  defaultStart.setMinutes(0, 0, 0);
  const local = new Date(defaultStart.getTime() - defaultStart.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return (
    <ActionForm
      action={createTournamentAction}
      submitLabel="Create"
      pendingLabel="Creating…"
      className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <label className="text-sm font-medium">Name</label>
      <input name="name" required className={inputCls} placeholder="Summer Beer Pong Cup" />
      <label className="text-sm font-medium">URL slug <span className="font-normal text-zinc-500">(optional)</span></label>
      <input name="slug" className={inputCls} placeholder="summer-cup" />
      <label className="text-sm font-medium">Description</label>
      <textarea name="description" rows={2} className={inputCls} />
      <label className="text-sm font-medium">Starts at</label>
      <input name="startsAt" type="datetime-local" required defaultValue={local} className={inputCls} />
      <div className="grid grid-cols-3 gap-3">
        <label className="text-sm">
          <span className="block font-medium">Game (min)</span>
          <input name="gameMin" type="number" min={1} defaultValue={20} className={`${inputCls} w-full`} />
        </label>
        <label className="text-sm">
          <span className="block font-medium">Break (min)</span>
          <input name="breakMin" type="number" min={0} defaultValue={5} className={`${inputCls} w-full`} />
        </label>
        <label className="text-sm">
          <span className="block font-medium">Tables</span>
          <input name="tableCount" type="number" min={1} defaultValue={2} className={`${inputCls} w-full`} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="block font-medium">Min players per team</span>
          <input name="minTeamSize" type="number" min={1} max={20} defaultValue={1} className={`${inputCls} w-full`} />
        </label>
        <label className="text-sm">
          <span className="block font-medium">Max</span>
          <input name="maxTeamSize" type="number" min={1} max={20} defaultValue={8} className={`${inputCls} w-full`} />
        </label>
      </div>
      <p className="-mt-1 text-xs text-zinc-500">Set both to 1 for a singles tournament.</p>
      <label className="text-sm font-medium">Score label</label>
      <input name="scoreLabel" defaultValue="Cups" className={inputCls} />
      <label className="flex items-center gap-2 text-sm">
        <input name="allowDraws" type="checkbox" /> Allow draws
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input name="manualRounds" type="checkbox" /> Manual rounds (no timer — you start and stop each round)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input name="testMode" type="checkbox" /> Test mode (simulator enabled, hidden from the public list)
      </label>
    </ActionForm>
  );
}
