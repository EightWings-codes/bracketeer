"use client";

import { useActionState } from "react";
import IconPicker from "@/components/IconPicker";
import type { ThemeIcon } from "@/lib/themes";
import { registerTeamAction, type RegisterFormState } from "../actions";

const initial: RegisterFormState = {};
const input =
  "rounded-lg border border-zinc-300 bg-transparent px-3 py-2 outline-none focus:border-emerald-500 dark:border-zinc-700";

export default function RegisterForm({
  slug,
  needsCode,
  solo,
  sizeHint,
  minMembers,
  icons,
  iconLabel,
  iconHint,
}: {
  slug: string;
  needsCode: boolean;
  /** Singles tournament: the entrant's name is the player, so no roster. */
  solo: boolean;
  sizeHint: string;
  minMembers: number;
  icons: ThemeIcon[];
  iconLabel: string;
  iconHint: string;
}) {
  const [state, action, pending] = useActionState(registerTeamAction, initial);
  const v = state.values;
  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <input type="hidden" name="slug" value={slug} />
      <label className="text-sm font-medium" htmlFor="name">
        {solo ? "Your name" : "Team name"}
      </label>
      <input id="name" name="name" required minLength={2} maxLength={40} defaultValue={v?.name} className={input} />
      {!solo && (
        <>
          <label className="mt-2 text-sm font-medium" htmlFor="members">
            Players{" "}
            <span className="font-normal text-zinc-500">({sizeHint}, one per line)</span>
          </label>
          <textarea
            id="members"
            name="members"
            rows={3}
            required={minMembers > 0}
            defaultValue={v?.members}
            className={input}
          />
        </>
      )}
      <div className="mt-3">
        <p className="text-sm font-medium">
          {iconLabel} <span className="font-normal text-zinc-500">(optional)</span>
        </p>
        <p className="mb-2 text-xs text-zinc-500">{iconHint}</p>
        <IconPicker icons={icons} />
      </div>
      <label className="mt-2 text-sm font-medium" htmlFor="contact">
        Contact <span className="font-normal text-zinc-500">(phone or handle, optional)</span>
      </label>
      <input id="contact" name="contact" defaultValue={v?.contact} className={input} />
      {needsCode && (
        <>
          <label className="mt-2 text-sm font-medium" htmlFor="joinCode">
            Join code <span className="font-normal text-zinc-500">(shown by the organiser)</span>
          </label>
          <input id="joinCode" name="joinCode" required autoCapitalize="characters" defaultValue={v?.joinCode} className={`${input} uppercase tracking-widest`} />
        </>
      )}
      {state.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {pending ? "Registering…" : solo ? "Enter" : "Register"}
      </button>
    </form>
  );
}
