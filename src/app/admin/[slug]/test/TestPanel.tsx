"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { inputCls } from "@/components/ui";
import { simResetAction, simSeedAction, simTickAction, type SimState } from "../actions";
import LocalTime from "@/components/LocalTime";

export default function TestPanel({ slug, status }: { slug: string; status: string }) {
  const router = useRouter();
  const [seedState, seed, seeding] = useActionState(simSeedAction, {} as SimState);
  const [tickState, tick, ticking] = useActionState(simTickAction, {} as SimState);
  const [resetState, reset, resetting] = useActionState(simResetAction, {} as SimState);
  const [auto, setAuto] = useState(false);
  const [autoClock, setAutoClock] = useState(true);
  const [autoConfirm, setAutoConfirm] = useState(true);
  const [log, setLog] = useState<Array<{ at: string; text: string }>>([]);
  const tickForm = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const entries = [...(seedState.log ?? []), ...(tickState.log ?? []), ...(resetState.log ?? [])];
    if (entries.length) setLog((l) => [...entries.reverse(), ...l].slice(0, 200));
    if (seedState.log || tickState.log || resetState.log) router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedState, tickState, resetState]);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => {
      if (!ticking) tickForm.current?.requestSubmit();
    }, 2000);
    return () => clearInterval(id);
  }, [auto, ticking]);

  const err = seedState.error ?? tickState.error ?? resetState.error;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-fuchsia-300 bg-white p-4 dark:border-fuchsia-900 dark:bg-zinc-900">
        <form action={seed} className="flex items-end gap-2">
          <input type="hidden" name="slug" value={slug} />
          <label className="text-xs text-zinc-500">
            Teams
            <input name="n" type="number" min={1} max={32} defaultValue={12} className={`${inputCls} block w-20`} />
          </label>
          <button disabled={seeding} className="rounded-lg bg-fuchsia-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50">
            {seeding ? "Seeding…" : "Seed & confirm teams"}
          </button>
        </form>

        <form ref={tickForm} action={tick} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="slug" value={slug} />
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="autoClock" checked={autoClock} onChange={(e) => setAutoClock(e.target.checked)} /> auto-clock
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="autoConfirm" checked={autoConfirm} onChange={(e) => setAutoConfirm(e.target.checked)} /> auto-confirm
          </label>
          <button disabled={ticking} className="rounded-lg bg-fuchsia-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50">
            Tick once
          </button>
          <button
            type="button"
            onClick={() => setAuto((a) => !a)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${auto ? "bg-red-600 text-white" : "border border-zinc-300 dark:border-zinc-700"}`}
          >
            {auto ? "■ Stop auto-tick" : "▶ Auto-tick every 2 s"}
          </button>
        </form>

        <form action={reset} className="ml-auto">
          <input type="hidden" name="slug" value={slug} />
          <button disabled={resetting} className="rounded-lg border border-red-400 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950">
            Reset test data
          </button>
        </form>
        <div className="w-full text-xs text-zinc-500">Status: {status.toLowerCase()}. Ticks: {auto ? "running" : "manual"}.</div>
        {err && <p className="w-full text-sm text-red-600">{err}</p>}
      </div>

      <ul className="max-h-96 overflow-y-auto rounded-xl border border-zinc-200 bg-white font-mono text-xs dark:border-zinc-800 dark:bg-zinc-900">
        {log.length === 0 && <li className="p-3 text-zinc-500">Simulator log will appear here.</li>}
        {log.map((e, i) => (
          <li key={i} className="flex gap-3 border-b border-zinc-100 px-3 py-1 dark:border-zinc-800">
            <LocalTime iso={e.at} className="shrink-0 text-zinc-400" />
            <span>{e.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
