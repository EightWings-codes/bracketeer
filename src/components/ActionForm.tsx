"use client";

import { useActionState, type ReactNode } from "react";

export interface ActionState {
  error?: string;
  ok?: string;
}

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Generic form around a `(prev, formData) => ActionState` server action.
 * Children are the inputs; hidden fields carry ids. Shows error/ok inline.
 */
export default function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel,
  className = "",
  variant = "primary",
  hidden = {},
  inline = false,
}: {
  action: Action;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  hidden?: Record<string, string | number | null | undefined>;
  inline?: boolean;
}) {
  const [state, act, pending] = useActionState(action, {} as ActionState);
  const btn = {
    primary: "bg-emerald-600 text-white hover:bg-emerald-500",
    secondary: "border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800",
    danger: "bg-red-600 text-white hover:bg-red-500",
    ghost: "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100",
  }[variant];
  return (
    <form action={act} className={`${inline ? "inline-flex flex-wrap items-end gap-2" : "flex flex-col gap-2"} ${className}`}>
      {Object.entries(hidden).map(([k, v]) =>
        v === null || v === undefined ? null : <input key={k} type="hidden" name={k} value={String(v)} />,
      )}
      {children}
      <button
        type="submit"
        disabled={pending}
        className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${btn}`}
      >
        {pending ? pendingLabel ?? "…" : submitLabel}
      </button>
      {state.error && <p className="w-full text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {state.ok && <p className="w-full text-sm text-emerald-600">{state.ok}</p>}
    </form>
  );
}

export const inputCls =
  "rounded-lg border border-zinc-300 bg-transparent px-2 py-1 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700";
