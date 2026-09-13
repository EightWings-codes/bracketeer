import type { ViewMatch } from "@/lib/view";

const ORDER = ["R16", "QUARTER", "SEMI", "FINAL", "THIRD"] as const;
const LABEL: Record<string, string> = {
  R16: "Round of 16",
  QUARTER: "Quarter-finals",
  SEMI: "Semi-finals",
  FINAL: "Final",
  THIRD: "3rd place",
};

/** Columns per stage; the 3rd-place match is shown under the final. */
export default function Bracket({
  matches,
  tableLabel,
  highlightId,
}: {
  matches: ViewMatch[];
  tableLabel: (n: number) => string;
  highlightId?: string | null;
}) {
  const stageOf = (m: ViewMatch) => (m.sourceAKind === "LOSER" ? "THIRD" : m.stage);
  const stages = ORDER.filter((s) => s !== "THIRD" && matches.some((m) => stageOf(m) === s));
  const third = matches.filter((m) => stageOf(m) === "THIRD");

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max gap-6">
        {stages.map((s) => (
          <div key={s} className="flex w-56 flex-col justify-around gap-3">
            <div className="text-xs uppercase text-zinc-500">{LABEL[s]}</div>
            {matches
              .filter((m) => stageOf(m) === s)
              .map((m) => <Cell key={m.id} m={m} tableLabel={tableLabel} highlightId={highlightId} />)}
            {s === "FINAL" && third.length > 0 && (
              <>
                <div className="mt-4 text-xs uppercase text-zinc-500">{LABEL.THIRD}</div>
                {third.map((m) => <Cell key={m.id} m={m} tableLabel={tableLabel} highlightId={highlightId} />)}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Cell({
  m,
  tableLabel,
  highlightId,
}: {
  m: ViewMatch;
  tableLabel: (n: number) => string;
  highlightId?: string | null;
}) {
  const has = m.scoreA !== null && m.scoreB !== null && m.status === "CONFIRMED";
  const row = (label: string, id: string | null, score: number | null, won: boolean) => (
    <div
      className={[
        "flex justify-between gap-2 px-3 py-1.5",
        !id ? "italic text-zinc-400" : "",
        won ? "font-semibold" : has ? "text-zinc-500" : "",
        id && id === highlightId ? "bg-emerald-50 dark:bg-emerald-950/40" : "",
      ].join(" ")}
    >
      <span className="truncate">{label}</span>
      <span className="tabular-nums">{score ?? ""}</span>
    </div>
  );
  return (
    <div className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white text-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
      {row(m.labelA, m.teamAId, m.scoreA, has && m.scoreA! > m.scoreB!)}
      {row(m.labelB, m.teamBId, m.scoreB, has && m.scoreB! > m.scoreA!)}
      <div className="px-3 py-1 text-xs text-zinc-500">
        {m.slotLabel} · {tableLabel(m.tableNo)}
      </div>
    </div>
  );
}
