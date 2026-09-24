import type { ViewMatch } from "@/lib/view";
import StatusBadge from "./StatusBadge";
import TeamIcon from "./TeamIcon";

/**
 * A match as the players themselves need it: who is playing, on which table,
 * in type big enough to read from across the room. The round it belongs to is
 * a caption, not the headline — "Winners semi-finals" tells nobody whose turn
 * it is.
 */
export default function LiveMatch({
  m,
  tableLabel,
  highlightId,
  theme,
  iconFor,
  children,
}: {
  m: ViewMatch;
  tableLabel: string;
  highlightId?: string | null;
  theme?: string;
  /** Team id → emblem id. */
  iconFor?: (teamId: string | null) => string | null;
  children?: React.ReactNode;
}) {
  const hasScore = m.scoreA !== null && m.scoreB !== null;
  const settled = hasScore && m.status === "CONFIRMED";

  const side = (name: string, id: string | null, score: number | null, won: boolean) => (
    <div className="flex items-baseline justify-between gap-3">
      {theme && iconFor?.(id) && (
        <TeamIcon theme={theme} icon={iconFor(id)} size="md" className="self-center" />
      )}
      <span
        className={[
          "min-w-0 truncate text-xl font-semibold sm:text-2xl",
          !id ? "text-base font-normal italic text-zinc-400 sm:text-lg" : "",
          id && id === highlightId ? "text-emerald-600 dark:text-emerald-400" : "",
          settled && !won ? "font-normal text-zinc-500" : "",
        ].join(" ")}
      >
        {name}
      </span>
      <span
        className={[
          "shrink-0 text-xl tabular-nums sm:text-2xl",
          won ? "font-bold" : "font-medium text-zinc-500",
        ].join(" ")}
      >
        {score ?? ""}
      </span>
    </div>
  );

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-zinc-500">
        <span className="truncate">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{tableLabel}</span>
          {m.groupName ? ` · ${m.groupName}` : ""} · {m.slotLabel}
        </span>
        <StatusBadge value={m.status} />
      </div>
      <div className="space-y-1">
        {side(m.labelA, m.teamAId, m.scoreA, hasScore && m.scoreA! > m.scoreB!)}
        {/* Without scores the two names would read as a list, not a fixture. */}
        {!hasScore && (
          <div className="flex items-center gap-2 py-0.5" aria-hidden="true">
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
            <span className="text-xs uppercase tracking-wide text-zinc-400">vs</span>
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          </div>
        )}
        {side(m.labelB, m.teamBId, m.scoreB, hasScore && m.scoreB! > m.scoreA!)}
      </div>
      {children}
    </div>
  );
}
