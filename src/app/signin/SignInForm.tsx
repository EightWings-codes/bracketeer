"use client";

import { useActionState } from "react";
import { signInAction, type AuthFormState } from "../auth-actions";

const initial: AuthFormState = {};

export default function SignInForm() {
  const [state, action, pending] = useActionState(signInAction, initial);

  return (
    <form
      action={action}
      className="flex w-full flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <label htmlFor="username" className="text-sm font-medium">
        Username
      </label>
      <input
        id="username"
        name="username"
        required
        autoComplete="username"
        autoCapitalize="none"
        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 outline-none focus:border-emerald-500 dark:border-zinc-700"
      />
      <label htmlFor="password" className="mt-2 text-sm font-medium">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 outline-none focus:border-emerald-500 dark:border-zinc-700"
      />
      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
