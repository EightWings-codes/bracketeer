import { scheduleRows } from "@/lib/board";
import { fmtDelay, type TournamentView, type ViewMatch } from "@/lib/view";
import Countdown from "@/components/Countdown";
import LocalTime from "@/components/LocalTime";

/**
 * When each set of games starts — break included, and delay-aware, because it
 * reads the same projection the phone dashboard does. A round that over-runs
 * pushes every time below it without anyone touching anything.
 *
 * Rounds already played drop off once something is live: the screen is about
 * what happens next.
 */
export default function ScheduleView({
  v,
  compact = false,
  strip = false,
}: {
  v: TournamentView;
  compact?: boolean;
  /** One line across the foot of the combined board instead of a column. */
  strip?: boolean;
}) {
  const bySlot = new Map<string, ViewMatch[]>();
  for (const m of v.matches) bySlot.set(m.slotId, [...(bySlot.get(m.slotId) ?? []), m]);

  const rows = scheduleRows(v.slots, (id) => bySlot.get(id)?.length ?? 0, { manualRounds: v.manualRounds });

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="t-lg board-dim">No rounds planned yet.</p>
      </div>
    );
  }

  if (strip) {
    return (
      <div className="t-xs flex items-center gap-[2.5vh] overflow-hidden">
        {rows.slice(0, 6).map((r) => (
          <span key={r.id} className="flex shrink-0 items-baseline gap-[0.8vh]">
            <span className={`tabular-nums font-bold ${r.state === "running" ? "board-accent" : ""}`}>
              {r.startIso ? <LocalTime iso={r.startIso} /> : `R${r.number}`}
            </span>
            <span className={r.state === "running" ? "" : "board-dim"}>{r.label}</span>
          </span>
        ))}
      </div>
    );
  }

  // Every round shows its fixtures — that is the point of the view. Room is
  // made by the layout rather than by dropping teams: past six rounds the list
  // runs in two columns, and the type steps down as the plan gets longer.
  const columns = rows.length > 6 ? 2 : 1;
  const roundSize = compact ? "t-sm" : rows.length > 8 ? "t-sm" : "t-md";
  const timeSize = compact ? "t-md" : rows.length > 8 ? "t-md" : "t-lg";
  const fixtureSize = rows.length > 6 ? "t-xs" : "t-sm";

  return (
    <div className="flex h-full flex-col gap-[1vh]">
      <h2 className={`${compact ? "t-sm" : "t-md"} shrink-0 font-bold uppercase tracking-wide`}>
        Coming up
      </h2>
      <ol
        className="grid min-h-0 flex-1 auto-rows-min content-start gap-[0.8vh]"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {rows.map((r) => {
          const fixtures = compact ? [] : (bySlot.get(r.id) ?? []);
          return (
            <li
              key={r.id}
              className="board-panel flex items-start gap-[2vh] px-[2vh] py-[1vh]"
              style={r.state === "running" ? { borderColor: "var(--board-accent)" } : undefined}
            >
              <span
                className={`${timeSize} w-[6ch] shrink-0 font-bold tabular-nums ${
                  r.state === "running" ? "board-accent" : ""
                }`}
              >
                {r.state === "running" ? "now" : r.startIso ? <LocalTime iso={r.startIso} /> : `R${r.number}`}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-[1.2vh]">
                  <span className={`${roundSize} truncate font-semibold`}>{r.label}</span>
                  <span className="t-xs board-dim shrink-0">
                    {r.games} {r.games === 1 ? "game" : "games"}
                    {r.state !== "running" && r.delaySec > 60 && (
                      <span className="board-warn"> · {fmtDelay(r.delaySec)}</span>
                    )}
                  </span>
                </span>

                {fixtures.length > 0 && (
                  <ul className="mt-[0.4vh] flex flex-wrap gap-x-[2.5vh] gap-y-[0.2vh]">
                    {fixtures.map((m) => (
                      <li key={m.id} className={`${fixtureSize} truncate`}>
                        <span className="t-xs board-accent">{v.tableLabel(m.tableNo)}</span>{" "}
                        {m.placeLabel && <span className="t-xs board-dim">{m.placeLabel} </span>}
                        <Side label={m.labelA} known={Boolean(m.teamAId)} />
                        <span className="board-dim"> – </span>
                        <Side label={m.labelB} known={Boolean(m.teamBId)} />
                      </li>
                    ))}
                  </ul>
                )}
              </span>

              {r.endIso && (
                <span className="shrink-0 text-right">
                  <span className="t-xs board-dim block uppercase tracking-widest">ends in</span>
                  <Countdown
                    targetIso={v.manualRounds && v.clock.phase === "game" ? v.clock.endsAt.toISOString() : r.endIso}
                    serverNowIso={v.now.toISOString()}
                    stopAtZero={v.manualRounds}
                    overrunLabel={v.manualRounds ? "" : "over"}
                    className={`${roundSize} font-bold tabular-nums`}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * A side that is still being decided reads as what it is waiting for —
 * "Winner of SF T1", "2nd Group B" — or plainly as TBD when even that is not
 * known yet. Either way it is set apart from a team that is actually through.
 */
function Side({ label, known }: { label: string; known: boolean }) {
  return <span className={known ? "font-semibold" : "board-dim italic"}>{label}</span>;
}
