"use client";

import { useActionState } from "react";
import { submitScoreAction, type ScoreFormState } from "@/app/t/[slug]/actions";

const initial: ScoreFormState = {};

export default function ScoreForm({
  matchId,
  slug,
  teamA,
  teamB,
  teamToken,
  scoreLabel,
  askName,
}: {
  matchId: string;
  slug: string;
  teamA: string;
  teamB: string;
  teamToken?: string;
  scoreLabel: string;
  askName: boolean;
}) {
  const [state, action, pending] = useActionState(submitScoreAction, initial);
  if (state.ok) {
    return <p className="text-sm text-emerald-600">Result sent — waiting for the organiser to confirm.</p>;
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-2 text-sm">
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="slug" value={slug} />
      {teamToken && <input type="hidden" name="teamToken" value={teamToken} />}
      <label className="flex flex-col">
        <span className="truncate text-xs text-zinc-500">{teamA}</span>
        <input name="scoreA" type="number" min={0} inputMode="numeric" required className="w-20 rounded-lg border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700" />
      </label>
      <span className="pb-1.5 text-zinc-400">:</span>
      <label className="flex flex-col">
        <span className="truncate text-xs text-zinc-500">{teamB}</span>
        <input name="scoreB" type="number" min={0} inputMode="numeric" required className="w-20 rounded-lg border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700" />
      </label>
      {askName && (
        <label className="flex flex-col">
          <span className="text-xs text-zinc-500">Your name (optional)</span>
          <input name="reportedBy" className="w-36 rounded-lg border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700" />
        </label>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {pending ? "Sending…" : `Send ${scoreLabel.toLowerCase()}`}
      </button>
      {state.error && <p className="w-full text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  );
}
