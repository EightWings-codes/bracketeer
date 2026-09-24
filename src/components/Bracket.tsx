import type { ViewMatch } from "@/lib/view";

/**
 * Columns are rounds, taken from the slot label rather than the stage: a round
 * too wide for the tables is split across several slots ("Quarter-finals
 * (1/2)") and must still read as one column, and 32-team or losers-bracket
 * rounds repeat a stage.
 */
const roundOf = (m: ViewMatch) => m.slotLabel.replace(/\s*\(\d+\/\d+\)\s*$/, "");

export interface BracketColumn {
  title: string;
  order: number;
  matches: ViewMatch[];
}

/** Exported so the projector board draws the same rounds in the same order. */
export function bracketColumns(ms: ViewMatch[]): BracketColumn[] {
  const by = new Map<string, BracketColumn>();
  for (const m of ms) {
    const title = roundOf(m);
    const col = by.get(title) ?? { title, order: m.slotIndex, matches: [] };
    col.order = Math.min(col.order, m.slotIndex);
    col.matches.push(m);
    by.set(title, col);
  }
  return [...by.values()].sort((a, b) => a.order - b.order);
}

export default function Bracket({
  matches,
  tableLabel,
  highlightId,
}: {
  matches: ViewMatch[];
  tableLabel: (n: number) => string;
  highlightId?: string | null;
}) {
  const losers = matches.filter((m) => m.stage === "LOSERS");
  const grandFinal = matches.filter((m) => m.stage === "GRAND_FINAL");
  const double = losers.length > 0 || grandFinal.length > 0;

  // Single elimination plays 3rd place alongside the final, so it shares the
  // final's slot and is told apart by its source: the losers of the semis.
  const third = double ? [] : matches.filter((m) => m.sourceAKind === "LOSER");
  const winners = matches.filter(
    (m) => m.stage !== "LOSERS" && m.stage !== "GRAND_FINAL" && !third.includes(m),
  );

  return (
    <div className="space-y-6 overflow-x-auto">
      <Row
        label={double ? "Winners bracket" : null}
        columns={bracketColumns(winners)}
        tableLabel={tableLabel}
        highlightId={highlightId}
        trailing={
          third.length > 0 ? { title: "3rd place", matches: third } : null
        }
      />
      {losers.length > 0 && (
        <Row label="Losers bracket" columns={bracketColumns(losers)} tableLabel={tableLabel} highlightId={highlightId} />
      )}
      {grandFinal.length > 0 && (
        <Row label={null} columns={bracketColumns(grandFinal)} tableLabel={tableLabel} highlightId={highlightId} />
      )}
    </div>
  );
}

function Row({
  label,
  columns: cols,
  tableLabel,
  highlightId,
  trailing = null,
}: {
  label: string | null;
  columns: BracketColumn[];
  tableLabel: (n: number) => string;
  highlightId?: string | null;
  trailing?: { title: string; matches: ViewMatch[] } | null;
}) {
  if (cols.length === 0) return null;
  return (
    <div>
      {label && <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</div>}
      <div className="flex min-w-max gap-6">
        {cols.map((c, i) => (
          <div key={c.title} className="flex w-56 flex-col justify-around gap-3">
            <div className="text-xs uppercase text-zinc-500">{c.title}</div>
            {c.matches.map((m) => (
              <Cell key={m.id} m={m} tableLabel={tableLabel} highlightId={highlightId} />
            ))}
            {trailing && i === cols.length - 1 && (
              <>
                <div className="mt-4 text-xs uppercase text-zinc-500">{trailing.title}</div>
                {trailing.matches.map((m) => (
                  <Cell key={m.id} m={m} tableLabel={tableLabel} highlightId={highlightId} />
                ))}
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
      <span className="truncate" title={label}>
        {label}
      </span>
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
