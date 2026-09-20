const COLORS: Record<string, string> = {
  DRAFT: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  REGISTRATION: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  LOCKED: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  READY: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  RUNNING: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  FINISHED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  CONFIRMED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  SCHEDULED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  REPORTED: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  VOID: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  done: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  running: "bg-emerald-600 text-white",
  upcoming: "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400",
  TEST: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-300",
};

/**
 * One glyph per state, so a badge reads at a glance and still works when the
 * label is dropped. The lifecycle runs ✎ → ✚ → ⏸ → ≡ → ▶ → ✓.
 */
export const SYMBOLS: Record<string, string> = {
  DRAFT: "✎",
  REGISTRATION: "✚",
  LOCKED: "⏸",
  READY: "≡",
  RUNNING: "▶",
  FINISHED: "✓",
  PENDING: "◌",
  CONFIRMED: "✓",
  REJECTED: "✕",
  SCHEDULED: "○",
  REPORTED: "✎",
  VOID: "✕",
  done: "✓",
  running: "▶",
  upcoming: "○",
  TEST: "⚑",
};

export function statusSymbol(value: string): string {
  return SYMBOLS[value] ?? "•";
}

export default function StatusBadge({
  value,
  className = "",
  symbolOnly = false,
}: {
  value: string;
  className?: string;
  /** Render just the glyph — the label stays available to screen readers. */
  symbolOnly?: boolean;
}) {
  const label = value.toLowerCase();
  return (
    <span
      title={symbolOnly ? label : undefined}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${COLORS[value] ?? COLORS.DRAFT} ${className}`}
    >
      <span aria-hidden="true">{statusSymbol(value)}</span>
      <span className={symbolOnly ? "sr-only" : ""}>{label}</span>
    </span>
  );
}
