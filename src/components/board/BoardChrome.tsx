import type { BoardConfig } from "@/lib/board";
import type { TournamentView } from "@/lib/view";
import { fmtDelay } from "@/lib/view";
import Countdown from "@/components/Countdown";
import QrCode from "@/components/QrCode";
import { statusSymbol } from "@/components/StatusBadge";

/**
 * The chrome: a band across the top and a QR card down the side. Neither is
 * ever rotated away — whatever the stage is showing, the room can always see
 * what this is, how long is left, and where to scan.
 */
export function BoardBand({ v, cfg }: { v: TournamentView; cfg: BoardConfig }) {
  const current = v.running[0] ?? v.next ?? null;
  const live = v.running.length > 0;
  const facts = [
    current ? current.label : null,
    v.slots.length > 0 && current ? `round ${current.index + 1} of ${v.slots.length}` : null,
    v.venueName,
    cfg.msg,
  ].filter(Boolean);

  return (
    <header
      className="flex shrink-0 items-end justify-between gap-[2vh] border-b pb-[1.2vh]"
      style={{ borderColor: "var(--board-line)" }}
    >
      <div className="min-w-0">
        <h1 className="t-lg flex min-w-0 items-center gap-[1vh] font-bold">
          <span aria-hidden="true">{v.themeConfig.emblem}</span>
          <span className="truncate">{v.name}</span>
          {live && (
            <span className="board-live board-accent t-xs shrink-0 uppercase tracking-widest" aria-hidden="true">
              ● live
            </span>
          )}
          {v.testMode && <span className="t-xs shrink-0 board-dim uppercase tracking-widest">⚑ test</span>}
        </h1>
        <p className="t-xs board-dim truncate">
          <span aria-hidden="true">{statusSymbol(v.status)} </span>
          {facts.join(" · ") || v.status.toLowerCase()}
        </p>
      </div>
      {cfg.timer && <BoardTimer v={v} />}
    </header>
  );
}

/**
 * Time left in the running round, counted down from the projection — so it
 * agrees with the phone in every player's pocket, over-runs included. With no
 * round running it counts towards the next one instead. Manual rounds read
 * the round clock: the game from its start, the break from its stop, and both
 * hold at zero until the organiser moves on.
 */
function BoardTimer({ v }: { v: TournamentView }) {
  const nowIso = v.now.toISOString();
  const running = v.running[0] ?? null;

  if (v.status === "FINISHED") return null;

  let caption: string;
  let targetIso: string;
  let stopAtZero = false;
  let delaySec = 0;

  if (v.manualRounds) {
    const c = v.clock;
    if (c.phase === "idle") return null;
    caption = c.phase === "game" ? "time left" : c.phase === "break" ? "break" : "starts in";
    targetIso = c.endsAt.toISOString();
    stopAtZero = true;
  } else if (running && v.runningEnd) {
    caption = "time left";
    targetIso = v.runningEnd.toISOString();
    delaySec = running.projection.delaySec;
  } else if (v.next) {
    caption = "next round in";
    targetIso = v.next.projection.projectedStart.toISOString();
    delaySec = v.next.projection.delaySec;
  } else {
    caption = "starts in";
    targetIso = v.startsAt.toISOString();
  }

  return (
    <div className="shrink-0 text-right">
      <div className="t-xs board-dim uppercase tracking-widest">{caption}</div>
      <Countdown
        targetIso={targetIso}
        serverNowIso={nowIso}
        stopAtZero={stopAtZero}
        overrunLabel={stopAtZero ? "" : "over"}
        className="t-2xl block font-bold tabular-nums"
      />
      {delaySec > 60 && <div className="t-xs board-warn">{fmtDelay(delaySec)}</div>}
    </div>
  );
}

export async function BoardQr({ url, status, wide }: { url: string; status: string; wide: boolean }) {
  const caption =
    status === "DRAFT" || status === "REGISTRATION"
      ? "Scan to register"
      : status === "FINISHED"
        ? "Scan for the final table"
        : "Scan for your next match";

  return (
    <div className="board-panel flex flex-col items-center gap-[1vh] p-[1.2vh] text-center">
      <QrCode value={url} size={wide ? "26vh" : "15vh"} />
      <div className="w-full">
        <div className={`${wide ? "t-sm" : "t-xs"} font-semibold`}>{caption}</div>
        <div className="t-xs board-dim break-all">{url.replace(/^https?:\/\//, "")}</div>
      </div>
    </div>
  );
}
