import { fitClass, podium, type BoardConfig } from "@/lib/board";
import type { TournamentView, ViewMatch } from "@/lib/view";
import Countdown from "@/components/Countdown";
import LocalTime from "@/components/LocalTime";
import SignupFlourish from "@/components/SignupFlourish";
import TeamIcon from "@/components/TeamIcon";

/**
 * The hero view: who is playing right now, on which table, and who is up
 * next — over the venue backdrop. Before a ball is thrown it is a poster
 * instead, and once the final is in it is the podium. Same slot on the board,
 * whatever the tournament happens to be doing.
 */
export default function GamesView({
  v,
  cfg,
  compact = false,
}: {
  v: TournamentView;
  cfg: BoardConfig;
  compact?: boolean;
}) {
  const pre = v.status === "DRAFT" || v.status === "REGISTRATION";
  const finished = v.status === "FINISHED";
  const crowned = finished ? crown(v) : null;

  return (
    <Backdrop v={v} cfg={cfg} flourish={pre}>
      {pre ? (
        <Poster v={v} compact={compact} />
      ) : crowned ? (
        <Podium {...crowned} compact={compact} />
      ) : (
        <Live v={v} compact={compact} />
      )}
    </Backdrop>
  );
}

// --------------------------------------------------------------------- live

function Live({ v, compact }: { v: TournamentView; compact: boolean }) {
  const inSlots = (ids: string[]) => v.matches.filter((m) => ids.includes(m.slotId));
  const runningMatches = inSlots(v.running.map((s) => s.id));
  const nextMatches = v.next ? inSlots([v.next.id]) : [];

  const live = runningMatches.length > 0;
  const hero = live ? runningMatches : nextMatches;
  const heroSlot = live ? v.running[0] : v.next;
  const following = live ? nextMatches : v.upcoming[1] ? inSlots([v.upcoming[1]!.id]) : [];
  const followingSlot = live ? v.next : v.upcoming[1];

  if (hero.length === 0) {
    return (
      <Centered>
        <p className="t-xl board-dim">Nothing scheduled.</p>
      </Centered>
    );
  }

  const cols = compact ? (hero.length > 2 ? 2 : 1) : hero.length > 4 ? 3 : hero.length > 1 ? 2 : 1;

  return (
    <div className="flex h-full flex-col gap-[1.5vh]">
      <div className="flex shrink-0 items-baseline justify-between gap-[2vh]">
        <h2 className={`${compact ? "t-sm" : "t-md"} font-bold uppercase tracking-wide`}>
          {live ? "Now playing" : "Up next"}
        </h2>
        <span className="t-xs board-dim truncate">{heroSlot?.label}</span>
      </div>

      <div
        className="grid min-h-0 flex-1 gap-[1.5vh]"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {hero.map((m) => (
          <MatchCard key={m.id} m={m} v={v} cols={cols} compact={compact} dim={!live} />
        ))}
      </div>

      {following.length > 0 && <Then v={v} matches={following} slot={followingSlot} compact={compact} />}
    </div>
  );
}

/**
 * What comes after the live round. Dimmer than the games above it, but still
 * a fixture somebody has to read from the back of the room — so it gets cards
 * and real type, not a caption.
 */
function Then({
  v,
  matches,
  slot,
  compact,
}: {
  v: TournamentView;
  matches: ViewMatch[];
  slot: TournamentView["slots"][number] | null | undefined;
  compact: boolean;
}) {
  const shown = matches.slice(0, compact ? 4 : 6);
  const cols = shown.length > 4 ? 3 : shown.length > 1 ? 2 : 1;
  const size = fitClass(
    shown.flatMap((m) => [m.labelA, m.labelB]),
    compact ? ["t-xs"] : ["t-md", "t-sm", "t-xs"],
    cols === 1 ? 20 : cols === 2 ? 14 : 10,
  );

  return (
    <div className="shrink-0 border-t pt-[1.2vh]" style={{ borderColor: "var(--board-line)" }}>
      <div className="t-xs board-dim mb-[0.8vh] flex items-baseline gap-[1vh] uppercase tracking-widest">
        <span>Then</span>
        <span className="truncate normal-case tracking-normal">{slot?.label}</span>
        {slot && !v.manualRounds && (
          <span className="ml-auto tabular-nums">
            <LocalTime iso={slot.projection.projectedStart.toISOString()} />
          </span>
        )}
      </div>
      <ul className="grid gap-[1vh]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {shown.map((m) => (
          <li key={m.id} className="board-panel flex items-baseline gap-[1.2vh] px-[1.5vh] py-[0.8vh]">
            <span className="t-xs board-accent shrink-0 font-semibold uppercase">{v.tableLabel(m.tableNo)}</span>
            <span className={`${size} min-w-0 flex-1 truncate`}>
              <span className={m.teamAId ? "font-semibold" : "board-dim italic"}>{m.labelA}</span>
              <span className="board-dim"> – </span>
              <span className={m.teamBId ? "font-semibold" : "board-dim italic"}>{m.labelB}</span>
            </span>
          </li>
        ))}
        {matches.length > shown.length && (
          <li className="t-xs board-dim self-center">+{matches.length - shown.length} more</li>
        )}
      </ul>
    </div>
  );
}

/** A match at projector size: names first, everything else a caption. */
function MatchCard({
  m,
  v,
  cols,
  compact,
  dim,
}: {
  m: ViewMatch;
  v: TournamentView;
  cols: number;
  compact: boolean;
  dim: boolean;
}) {
  const hasScore = m.scoreA !== null && m.scoreB !== null;
  const settled = hasScore && m.status === "CONFIRMED";
  const steps = compact ? ["t-sm", "t-xs"] : ["t-xl", "t-lg", "t-md", "t-sm"];
  const size = fitClass([m.labelA, m.labelB], steps, cols === 1 ? 20 : cols === 2 ? 13 : 9);

  const side = (label: string, id: string | null, score: number | null, won: boolean) => (
    <div className="flex items-center justify-between gap-[1.5vh]">
      <div className="flex min-w-0 items-center gap-[1.2vh]">
        {id && <TeamIcon theme={v.theme} icon={v.teamIcon.get(id) ?? null} size={compact ? "xl" : "2xl"} />}
        <span
          className={[
            size,
            "min-w-0 truncate font-semibold",
            !id ? "board-dim italic" : "",
            settled && !won ? "board-dim font-normal" : "",
          ].join(" ")}
        >
          {label}
        </span>
      </div>
      <span className={`${size} shrink-0 tabular-nums ${won ? "font-bold" : "board-dim"}`}>{score ?? ""}</span>
    </div>
  );

  return (
    <div
      className={`board-panel flex min-h-0 flex-col justify-center gap-[0.8vh] px-[2vh] py-[1.5vh] ${dim ? "opacity-70" : ""}`}
    >
      <div className="t-xs board-dim flex items-baseline justify-between gap-[1vh]">
        <span className="board-accent truncate font-semibold uppercase tracking-wide">{v.tableLabel(m.tableNo)}</span>
        <span className="truncate">{m.groupName ?? m.slotLabel}</span>
      </div>
      {side(m.labelA, m.teamAId, m.scoreA, hasScore && m.scoreA! > m.scoreB!)}
      {!hasScore && (
        <div className="flex items-center gap-[1vh]" aria-hidden="true">
          <span className="h-px flex-1" style={{ background: "var(--board-line)" }} />
          <span className="t-xs board-dim uppercase tracking-widest">vs</span>
          <span className="h-px flex-1" style={{ background: "var(--board-line)" }} />
        </div>
      )}
      {side(m.labelB, m.teamBId, m.scoreB, hasScore && m.scoreB! > m.scoreA!)}
      {m.status === "REPORTED" && (
        <div className="t-xs board-warn uppercase tracking-widest">reported · awaiting confirmation</div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- poster

/** Draft and registration: the screen is a poster and it holds still. */
function Poster({ v, compact }: { v: TournamentView; compact: boolean }) {
  const shown = v.teams.filter((t) => t.status !== "REJECTED");
  const future = v.startsAt.getTime() > v.now.getTime();
  const nameSize = fitClass([v.name], compact ? ["t-lg", "t-md"] : ["t-3xl", "t-2xl", "t-xl"], compact ? 18 : 22);

  return (
    <div className="flex h-full flex-col gap-[2vh]">
      <div className="shrink-0">
        <h2 className={`${nameSize} font-bold tracking-tight`}>{v.name}</h2>
        {v.description && <p className="t-sm board-dim mt-[0.5vh] line-clamp-2">{v.description}</p>}
        <p className="t-sm board-dim mt-[1vh] tabular-nums">
          {v.status === "REGISTRATION" ? "Registration open · " : ""}
          starts <LocalTime iso={v.startsAt.toISOString()} withDate />
          {future && (
            <>
              {" · in "}
              <Countdown
                targetIso={v.startsAt.toISOString()}
                serverNowIso={v.now.toISOString()}
                overrunLabel="now"
                className="board-accent font-semibold"
              />
            </>
          )}
        </p>
      </div>

      <div className="min-h-0 flex-1">
        <div className="t-xs board-dim mb-[1vh] uppercase tracking-widest">
          {shown.length} {shown.length === 1 ? "team" : "teams"} so far
        </div>
        {shown.length === 0 ? (
          <p className="t-lg board-dim italic">Nobody yet — be the first.</p>
        ) : (
          <ul className="flex flex-wrap content-start gap-[1.2vh]">
            {shown.map((t, i) => (
              <li
                key={t.id}
                style={{ animationDelay: `${Math.min(i, 16) * 40}ms` }}
                className="board-panel pop-in flex items-center gap-[1vh] px-[1.5vh] py-[0.8vh]"
              >
                <TeamIcon theme={v.theme} icon={t.icon} size={compact ? "xl" : "2xl"} />
                <span className={`${compact ? "t-xs" : "t-sm"} font-semibold`}>{t.name}</span>
                {t.status === "PENDING" && (
                  <span className="board-warn" title="awaiting confirmation" aria-hidden="true">
                    ●
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- podium

interface Crown {
  champion: string;
  runnerUp: string;
  third: string | null;
  score: string | null;
}

/**
 * The knockout decides it when there is one. A pure round robin has no final
 * to read, so the single group's table decides it instead — otherwise a
 * league would end on an empty screen.
 */
function crown(v: TournamentView): Crown | null {
  const fromBracket = podium(v.matches.filter((m) => m.stage !== "GROUP"));
  if (fromBracket) return fromBracket;
  if (v.groups.length !== 1) return null;
  const rows = v.standings.get(v.groups[0]!.id) ?? [];
  if (rows.length < 2 || rows[0]!.played === 0) return null;
  return {
    champion: rows[0]!.name,
    runnerUp: rows[1]!.name,
    third: rows[2]?.name ?? null,
    score: null,
  };
}

function Podium({ champion, runnerUp, third, score, compact }: Crown & { compact: boolean }) {
  const big = fitClass([champion], compact ? ["t-lg", "t-md"] : ["t-3xl", "t-2xl", "t-xl"], compact ? 16 : 18);
  return (
    <Centered>
      <div className="text-center">
        <div className={compact ? "t-lg" : "t-2xl"} aria-hidden="true">
          🥇
        </div>
        <div className={`${big} font-bold tracking-tight`}>{champion}</div>
        <div className="t-sm board-dim mt-[0.5vh] uppercase tracking-widest">
          champion{score ? ` · won ${score}` : ""}
        </div>
        <div className="t-md mt-[3vh] flex flex-wrap justify-center gap-x-[4vh] gap-y-[1vh]">
          <span>
            <span aria-hidden="true">🥈</span> {runnerUp}
          </span>
          {third && (
            <span>
              <span aria-hidden="true">🥉</span> {third}
            </span>
          )}
        </div>
      </div>
    </Centered>
  );
}

// -------------------------------------------------------------------- frame

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center">{children}</div>;
}

/**
 * The venue behind the games. It is a backdrop and nothing more: dimmed, held
 * back by a scrim, and never allowed to cost the names their contrast.
 */
function Backdrop({
  v,
  cfg,
  flourish,
  children,
}: {
  v: TournamentView;
  cfg: BoardConfig;
  flourish: boolean;
  children: React.ReactNode;
}) {
  const image = cfg.map ? cssUrl(v.venueImageUrl) : null;
  return (
    <div className="relative h-full overflow-hidden rounded-[1.4vh]">
      {image ? (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: image, opacity: 0.25, filter: "blur(2px)" }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{ background: "linear-gradient(100deg, var(--board-bg) 15%, transparent 75%)" }}
          />
        </>
      ) : (
        flourish && (
          <div className={`${v.themeConfig.accent} absolute inset-0 opacity-60`}>
            <SignupFlourish theme={v.theme} />
          </div>
        )
      )}
      <div className="relative h-full">{children}</div>
    </div>
  );
}

/** Only ever an absolute http(s) URL, and never allowed to close the url(). */
function cssUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const clean = raw.trim();
  if (!/^https?:\/\//i.test(clean)) return null;
  const safe = clean.replace(/["'\\()\s]/g, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`);
  return `url("${safe}")`;
}
