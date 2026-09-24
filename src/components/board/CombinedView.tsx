import type { BoardConfig, StandingsKind } from "@/lib/board";
import type { TournamentView } from "@/lib/view";
import GamesView from "./GamesView";
import ScheduleView from "./ScheduleView";
import StandingsView from "./StandingsView";

/**
 * The combined board — experimental, and the one layout that can genuinely
 * run out of room: a 32-team double elimination beside four live matches at
 * 1080p is tight. Everything steps down together through `board-compact`
 * rather than each panel inventing its own size, and the schedule gives up
 * its column to become a single line along the foot.
 */
export default function CombinedView({
  v,
  cfg,
  kind,
}: {
  v: TournamentView;
  cfg: BoardConfig;
  kind: StandingsKind;
}) {
  return (
    <div className="board-compact grid h-full grid-cols-[3fr_2fr] grid-rows-[minmax(0,1fr)_auto] gap-[1.5vh]">
      <div className="min-h-0 min-w-0">
        <GamesView v={v} cfg={cfg} compact />
      </div>
      <div className="min-h-0 min-w-0">
        <StandingsView v={v} kind={kind} compact />
      </div>
      <div className="col-span-2 border-t pt-[1vh]" style={{ borderColor: "var(--board-line)" }}>
        <ScheduleView v={v} compact strip />
      </div>
    </div>
  );
}
