/**
 * Shared class strings. Deliberately not in a `"use client"` module: a plain
 * value exported from one becomes a client reference, and a server component
 * that reads it gets a throwing stub instead of the string.
 */
export const inputCls =
  "rounded-lg border border-zinc-300 bg-transparent px-2 py-1 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700";
