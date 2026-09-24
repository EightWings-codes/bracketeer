import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { availableViews, parseBoardConfig, standingsKind, type BoardViewId, type SearchParams } from "@/lib/board";
import { APP } from "@/lib/config";
import { publicTournamentUrl } from "@/lib/public-url";
import { loadTournamentView } from "@/lib/view";
import AutoRefresh from "@/components/AutoRefresh";
import { BoardBand, BoardQr } from "@/components/board/BoardChrome";
import BoardShell, { type BoardSlide } from "@/components/board/BoardShell";
import CombinedView from "@/components/board/CombinedView";
import GamesView from "@/components/board/GamesView";
import ScheduleView from "@/components/board/ScheduleView";
import StandingsView from "@/components/board/StandingsView";

export const dynamic = "force-dynamic";

/**
 * The projector board. Deliberately not under /admin/[slug]: that layout
 * wraps its children in a nav bar and a 5xl column, which is precisely what a
 * board must not have — and a short path is easier to type on whatever laptop
 * ends up driving the beamer.
 *
 * Everything it can be told is in the query string; see docs/projector-board.md.
 */
export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const { slug } = await params;
  const [sp, v] = await Promise.all([searchParams, loadTournamentView(slug)]);
  if (!v) notFound();

  const cfg = parseBoardConfig(sp, { status: v.status, hasVenueImage: Boolean(v.venueImageUrl) });
  const hasGroups = v.groups.length > 0;
  const hasKnockout = v.matches.some((m) => m.stage !== "GROUP");
  const kind = standingsKind(cfg, {
    stage: (v.running[0] ?? v.next)?.stage ?? null,
    hasGroups,
    hasKnockout,
  });

  const labels: Record<BoardViewId, string> = {
    games: "Games",
    standings: kind === "bracket" ? "Bracket" : kind === "groups" ? "Tables" : "Teams",
    schedule: "Schedule",
  };
  const node = (id: BoardViewId) => {
    if (id === "games") return <GamesView v={v} cfg={cfg} />;
    if (id === "standings") return <StandingsView v={v} kind={kind} />;
    return <ScheduleView v={v} />;
  };

  const slides: BoardSlide[] =
    cfg.mode === "all"
      ? [{ id: "all", label: "Everything", dwellMs: 0, node: <CombinedView v={v} cfg={cfg} kind={kind} /> }]
      : availableViews(cfg, { groups: hasGroups, knockout: hasKnockout, slots: v.slots.length > 0 }).map((id) => ({
          id,
          label: labels[id],
          dwellMs: cfg.dwellMs[id],
          node: node(id),
        }));

  // Registration is the one phase where the QR is the point of the screen.
  const qrWide = v.status === "DRAFT" || v.status === "REGISTRATION";

  return (
    <>
      <AutoRefresh intervalMs={APP.pollIntervalMs} />
      <BoardShell
        slides={slides}
        band={cfg.band ? <BoardBand v={v} cfg={cfg} /> : null}
        qr={cfg.qr ? <BoardQr url={await publicTournamentUrl(slug)} status={v.status} wide={qrWide} /> : null}
        qrWide={qrWide}
        cfg={cfg}
      />
    </>
  );
}
