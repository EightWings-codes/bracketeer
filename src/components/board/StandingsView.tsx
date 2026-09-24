import type { StandingsKind } from "@/lib/board";
import type { TournamentView, ViewMatch } from "@/lib/view";
import { bracketColumns } from "@/components/Bracket";
import TeamIcon from "@/components/TeamIcon";
import FitToBox from "./FitToBox";

/**
 * Where the tournament stands: the group tables while a group round is on,
 * the tree once it is knockout. Same slot on the board either way — which is
 * the whole point of the view, so nobody has to know which phase they are in
 * to know where to look.
 */
export default function StandingsView({
  v,
  kind,
  compact = false,
}: {
  v: TournamentView;
  kind: StandingsKind;
  compact?: boolean;
}) {
  if (kind === "bracket") {
    const knockout = v.matches.filter((m) => m.stage !== "GROUP");
    const liveSlots = new Set(v.running.map((s) => s.id));
    return (
      <FitToBox>
        <BoardBracket matches={knockout} v={v} liveSlots={liveSlots} compact={compact} />
      </FitToBox>
    );
  }
  if (kind === "groups") return <Groups v={v} compact={compact} />;
  return <Roster v={v} compact={compact} />;
}

// ------------------------------------------------------------------- groups

function Groups({ v, compact }: { v: TournamentView; compact: boolean }) {
  const n = v.groups.length;
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
  const qualify = v.format?.advancePerGroup ?? 0;

  return (
    <div className="grid h-full gap-[1.5vh]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {v.groups.map((g) => {
        const rows = v.standings.get(g.id) ?? [];
        return (
          <div key={g.id} className="board-panel flex min-h-0 flex-col p-[1.5vh]">
            <h3 className={`${compact ? "t-xs" : "t-sm"} mb-[0.8vh] shrink-0 font-bold uppercase tracking-wide`}>
              {g.name}
            </h3>
            <table className={`${compact ? "t-xs" : "t-sm"} w-full`}>
              <thead className="t-xs board-dim uppercase">
                <tr>
                  <th className="w-[3ch] text-left font-medium">#</th>
                  <th className="text-left font-medium">team</th>
                  <th className="w-[4ch] text-right font-medium">p</th>
                  <th className="w-[5ch] text-right font-medium">+/−</th>
                  <th className="w-[5ch] text-right font-bold">pts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    // The line the whole group is playing for: everyone above
                    // it goes through.
                    className={qualify > 0 && r.position === qualify ? "border-b-2" : ""}
                    style={qualify > 0 && r.position === qualify ? { borderColor: "var(--board-accent)" } : undefined}
                  >
                    <td className="board-dim py-[0.35vh] tabular-nums">{r.rank}</td>
                    <td className="py-[0.35vh]">
                      <span className="flex items-center gap-[0.8vh]">
                        <TeamIcon theme={v.theme} icon={v.teamIcon.get(r.id) ?? null} size="xl" />
                        <span className="truncate font-semibold">{r.name}</span>
                      </span>
                    </td>
                    <td className="board-dim text-right tabular-nums">{r.played}</td>
                    <td className="board-dim text-right tabular-nums">
                      {r.diff > 0 ? "+" : ""}
                      {r.diff}
                    </td>
                    <td className="text-right font-bold tabular-nums">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ bracket

/**
 * The same rounds in the same order as the phone bracket — it shares
 * `bracketColumns` — drawn big and then scaled to the panel by FitToBox, so a
 * four-team draw and a 32-team double elimination both simply fit.
 */
function BoardBracket({
  matches,
  v,
  liveSlots,
  compact,
}: {
  matches: ViewMatch[];
  v: TournamentView;
  liveSlots: Set<string>;
  compact: boolean;
}) {
  const losers = matches.filter((m) => m.stage === "LOSERS");
  const grandFinal = matches.filter((m) => m.stage === "GRAND_FINAL");
  const double = losers.length > 0 || grandFinal.length > 0;
  const third = double ? [] : matches.filter((m) => m.sourceAKind === "LOSER");
  const winners = matches.filter((m) => m.stage !== "LOSERS" && m.stage !== "GRAND_FINAL" && !third.includes(m));

  const row = (label: string | null, ms: ViewMatch[], trailing: { title: string; matches: ViewMatch[] } | null) => {
    const cols = bracketColumns(ms);
    if (cols.length === 0) return null;
    return (
      <div key={label ?? "main"}>
        {label && <div className="t-xs board-dim mb-[0.8vh] uppercase tracking-widest">{label}</div>}
        <div className="flex gap-[2.5vh]">
          {cols.map((c, i) => {
            const live = c.matches.some((m) => liveSlots.has(m.slotId));
            return (
              <div key={c.title} className="flex w-[26vh] flex-col justify-around gap-[1.2vh]">
                <div
                  className={`t-xs uppercase tracking-widest ${live ? "board-accent font-bold" : "board-dim"}`}
                >
                  {live && <span aria-hidden="true">▶ </span>}
                  {c.title}
                </div>
                {c.matches.map((m) => (
                  <Cell key={m.id} m={m} v={v} live={liveSlots.has(m.slotId)} compact={compact} />
                ))}
                {trailing && i === cols.length - 1 && (
                  <>
                    <div className="t-xs board-dim mt-[2vh] uppercase tracking-widest">{trailing.title}</div>
                    {trailing.matches.map((m) => (
                      <Cell key={m.id} m={m} v={v} live={liveSlots.has(m.slotId)} compact={compact} />
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-[3vh]">
      {row(double ? "Winners bracket" : null, winners, third.length > 0 ? { title: "3rd place", matches: third } : null)}
      {losers.length > 0 && row("Losers bracket", losers, null)}
      {grandFinal.length > 0 && row(null, grandFinal, null)}
    </div>
  );
}

function Cell({ m, v, live, compact }: { m: ViewMatch; v: TournamentView; live: boolean; compact: boolean }) {
  const settled = m.scoreA !== null && m.scoreB !== null && m.status === "CONFIRMED";
  const line = (label: string, id: string | null, score: number | null, won: boolean) => (
    <div className="flex items-center justify-between gap-[1vh] px-[1.2vh] py-[0.6vh]">
      <span className="flex min-w-0 items-center gap-[0.8vh]">
        {id && <TeamIcon theme={v.theme} icon={v.teamIcon.get(id) ?? null} size="xl" />}
        <span className={`truncate ${!id ? "board-dim italic" : won ? "font-bold" : settled ? "board-dim" : ""}`}>
          {label}
        </span>
      </span>
      <span className="shrink-0 tabular-nums">{score ?? ""}</span>
    </div>
  );
  return (
    <div
      className={`board-panel ${compact ? "t-xs" : "t-sm"} overflow-hidden`}
      style={{ borderColor: live ? "var(--board-accent)" : "var(--board-line)" }}
    >
      {line(m.labelA, m.teamAId, m.scoreA, settled && m.scoreA! > m.scoreB!)}
      <span className="block h-px" style={{ background: "var(--board-line)" }} />
      {line(m.labelB, m.teamBId, m.scoreB, settled && m.scoreB! > m.scoreA!)}
    </div>
  );
}

// ------------------------------------------------------------------- roster

/** Before any draw exists there are no tables and no tree — only who is in. */
function Roster({ v, compact }: { v: TournamentView; compact: boolean }) {
  const shown = v.teams.filter((t) => t.status !== "REJECTED");
  return (
    <div className="flex h-full flex-col gap-[1.5vh]">
      <h2 className={`${compact ? "t-sm" : "t-md"} shrink-0 font-bold uppercase tracking-wide`}>
        {shown.length} {shown.length === 1 ? "team" : "teams"}
      </h2>
      <ul className="flex flex-wrap content-start gap-[1.2vh]">
        {shown.map((t) => (
          <li key={t.id} className="board-panel flex items-center gap-[1vh] px-[1.5vh] py-[0.8vh]">
            <TeamIcon theme={v.theme} icon={t.icon} size="xl" />
            <span className={`${compact ? "t-xs" : "t-sm"} font-semibold`}>{t.name}</span>
          </li>
        ))}
        {shown.length === 0 && <li className="t-md board-dim italic">No teams yet.</li>}
      </ul>
      <p className="t-xs board-dim mt-auto shrink-0">The draw appears here once the organiser locks the field.</p>
    </div>
  );
}
