"use client";

import { useActionState } from "react";
import { registerTeamAction, type RegisterFormState } from "../actions";

const initial: RegisterFormState = {};
const input =
  "rounded-lg border border-zinc-300 bg-transparent px-3 py-2 outline-none focus:border-emerald-500 dark:border-zinc-700";

export default function RegisterForm({ slug, needsCode }: { slug: string; needsCode: boolean }) {
  const [state, action, pending] = useActionState(registerTeamAction, initial);
  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <input type="hidden" name="slug" value={slug} />
      <label className="text-sm font-medium" htmlFor="name">
        Team name
      </label>
      <input id="name" name="name" required minLength={2} maxLength={40} className={input} />
      <label className="mt-2 text-sm font-medium" htmlFor="members">
        Players <span className="font-normal text-zinc-500">(one per line or comma-separated)</span>
      </label>
      <textarea id="members" name="members" rows={3} className={input} />
      <label className="mt-2 text-sm font-medium" htmlFor="contact">
        Contact <span className="font-normal text-zinc-500">(phone or handle, optional)</span>
      </label>
      <input id="contact" name="contact" className={input} />
      {needsCode && (
        <>
          <label className="mt-2 text-sm font-medium" htmlFor="joinCode">
            Join code <span className="font-normal text-zinc-500">(shown by the organiser)</span>
          </label>
          <input id="joinCode" name="joinCode" required autoCapitalize="characters" className={`${input} uppercase tracking-widest`} />
        </>
      )}
      {state.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {pending ? "Registering…" : "Register"}
      </button>
    </form>
  );
}
