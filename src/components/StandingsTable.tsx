import type { StandingRow } from "@/lib/standings";

export default function StandingsTable({
  rows,
  highlightId,
  qualify = 0,
  compact = false,
}: {
  rows: StandingRow[];
  highlightId?: string | null;
  /** Number of positions that advance (drawn as a line). */
  qualify?: number;
  compact?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-zinc-500">
          <tr>
            <th className="py-1 pr-2">#</th>
            <th className="py-1 pr-2">Team</th>
            <th className="py-1 pr-2 text-right">P</th>
            {!compact && (
              <>
                <th className="py-1 pr-2 text-right">W</th>
                <th className="py-1 pr-2 text-right">D</th>
                <th className="py-1 pr-2 text-right">L</th>
              </>
            )}
            <th className="py-1 pr-2 text-right">+/−</th>
            <th className="py-1 text-right font-bold">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className={[
                "border-t border-zinc-200 dark:border-zinc-800",
                r.id === highlightId ? "bg-emerald-50 font-semibold dark:bg-emerald-950/40" : "",
                qualify > 0 && r.position === qualify ? "border-b-2 border-b-emerald-500" : "",
              ].join(" ")}
            >
              <td className="py-1 pr-2 text-zinc-500">{r.rank}</td>
              <td className="py-1 pr-2">{r.name}</td>
              <td className="py-1 pr-2 text-right">{r.played}</td>
              {!compact && (
                <>
                  <td className="py-1 pr-2 text-right">{r.won}</td>
                  <td className="py-1 pr-2 text-right">{r.drawn}</td>
                  <td className="py-1 pr-2 text-right">{r.lost}</td>
                </>
              )}
              <td className="py-1 pr-2 text-right tabular-nums">
                {r.diff > 0 ? "+" : ""}
                {r.diff}
              </td>
              <td className="py-1 text-right font-bold tabular-nums">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
