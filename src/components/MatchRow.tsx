import type { ViewMatch } from "@/lib/view";
import StatusBadge from "./StatusBadge";

export default function MatchRow({
  m,
  tableLabel,
  highlightId,
  children,
}: {
  m: ViewMatch;
  tableLabel: string;
  highlightId?: string | null;
  children?: React.ReactNode;
}) {
  const hasScore = m.scoreA !== null && m.scoreB !== null;
  const side = (name: string, id: string | null, won: boolean) => (
    <span
      className={[
        "truncate",
        id && id === highlightId ? "font-bold text-emerald-700 dark:text-emerald-400" : "",
        !id ? "italic text-zinc-400" : "",
        hasScore && !won && m.status === "CONFIRMED" ? "text-zinc-500" : "",
      ].join(" ")}
    >
      {name}
    </span>
  );
  const aWon = hasScore && m.scoreA! > m.scoreB!;
  const bWon = hasScore && m.scoreB! > m.scoreA!;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
        <span>
          {tableLabel}
          {m.groupName ? ` · ${m.groupName}` : ""}
        </span>
        <StatusBadge value={m.status} />
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        {side(m.labelA, m.teamAId, aWon)}
        <span className="tabular-nums text-lg font-bold">
          {hasScore ? `${m.scoreA} : ${m.scoreB}` : "vs"}
        </span>
        <span className="text-right">{side(m.labelB, m.teamBId, bWon)}</span>
      </div>
      {children}
    </div>
  );
}
