import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { APP } from "@/lib/config";
import { fmtDelay, loadTournamentView } from "@/lib/view";
import AutoRefresh from "@/components/AutoRefresh";
import Countdown from "@/components/Countdown";
import LocalTime from "@/components/LocalTime";
import MatchRow from "@/components/MatchRow";
import ScoreForm from "@/components/ScoreForm";
import StandingsTable from "@/components/StandingsTable";
import StatusBadge from "@/components/StatusBadge";
import Bracket from "@/components/Bracket";

export const dynamic = "force-dynamic";

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; token: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { slug, token } = await params;
  const { new: isNew } = await searchParams;
  const team = await prisma.team.findUnique({ where: { token } });
  if (!team) notFound();
  const v = await loadTournamentView(slug);
  if (!v || v.id !== team.tournamentId) notFound();
  const nowIso = v.now.toISOString();

  const mine = v.matches.filter((m) => m.teamAId === team.id || m.teamBId === team.id);
  const current = mine.filter((m) => m.projection.state === "running" && m.status !== "CONFIRMED");
  const nextMatch = mine.find((m) => m.projection.state === "upcoming");
  const done = mine.filter((m) => m.status === "CONFIRMED");
  const group = team.groupId ? v.groups.find((g) => g.id === team.groupId) : null;
  const knockout = v.matches.filter((m) => m.stage !== "GROUP");

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <AutoRefresh intervalMs={APP.pollIntervalMs} />
      {isNew && (
        <div className="rounded-xl bg-emerald-100 p-4 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          <strong>You&apos;re registered.</strong> Bookmark this page — it&apos;s your team&apos;s private link. The organiser
          still has to confirm your team.
        </div>
      )}
      <header>
        <Link href={`/t/${slug}`} className="text-sm text-zinc-500 hover:underline">
          ← {v.name}
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight">{team.name}</h1>
          <StatusBadge value={team.status} />
        </div>
        {team.members.length > 0 && <p className="text-zinc-500">{team.members.join(", ")}</p>}
        {group && <p className="text-sm text-zinc-500">{group.name}</p>}
      </header>

      {team.status === "REJECTED" && (
        <p className="rounded-xl bg-red-100 p-4 text-red-900 dark:bg-red-950 dark:text-red-200">
          Sorry — this team was not admitted. Talk to the organiser.
        </p>
      )}

      {current.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">You&apos;re playing now</h2>
          {current.map((m) => (
            <MatchRow key={m.id} m={m} tableLabel={v.tableLabel(m.tableNo)} highlightId={team.id}>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                <div className="text-sm text-zinc-500">
                  Round ends in{" "}
                  <Countdown
                    targetIso={(v.manualRounds && v.clock.phase === "game" ? v.clock.endsAt : m.projection.projectedEnd).toISOString()}
                    serverNowIso={nowIso}
                    stopAtZero={v.manualRounds}
                    overrunLabel={v.manualRounds ? "" : "over"}
                    className="font-semibold tabular-nums"
                  />
                </div>
                {m.status !== "CONFIRMED" && (
                  <ScoreForm
                    matchId={m.id}
                    slug={slug}
                    teamA={m.labelA}
                    teamB={m.labelB}
                    teamToken={token}
                    scoreLabel={v.scoreLabel}
                    askName={false}
                  />
                )}
              </div>
            </MatchRow>
          ))}
        </section>
      )}

      {nextMatch && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-xs uppercase text-zinc-500">Your next match</div>
          <div className="mt-1 text-2xl font-semibold">
            vs {nextMatch.teamAId === team.id ? nextMatch.labelB : nextMatch.labelA}
          </div>
          <div className="text-zinc-500">
            {nextMatch.slotLabel} · {v.tableLabel(nextMatch.tableNo)} · ~
            <LocalTime iso={nextMatch.projection.projectedStart.toISOString()} />
            {!v.manualRounds && nextMatch.projection.delaySec > 60 && <span className="ml-1 text-amber-600">({fmtDelay(nextMatch.projection.delaySec)})</span>}
          </div>
          <Countdown
            targetIso={nextMatch.projection.projectedStart.toISOString()}
            serverNowIso={nowIso}
            className="mt-2 block text-4xl font-bold tabular-nums"
            stopAtZero={v.manualRounds}
            overrunLabel="starting soon"
          />
        </section>
      )}

      {!nextMatch && current.length === 0 && team.status === "CONFIRMED" && v.slots.length > 0 && (
        <p className="text-zinc-500">
          {mine.length === 0 ? "You're not in any scheduled match yet." : "No more matches scheduled for you right now."}
        </p>
      )}

      {group && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 font-semibold">{group.name}</h2>
          <StandingsTable rows={v.standings.get(group.id) ?? []} highlightId={team.id} qualify={v.format?.advancePerGroup ?? 0} compact />
        </section>
      )}

      {done.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Your results</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {done.map((m) => (
              <MatchRow key={m.id} m={m} tableLabel={v.tableLabel(m.tableNo)} highlightId={team.id} />
            ))}
          </div>
        </section>
      )}

      {knockout.some((m) => m.teamAId || m.teamBId) && (
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Knockout</h2>
          <Bracket matches={knockout} tableLabel={v.tableLabel} highlightId={team.id} />
        </section>
      )}
    </main>
  );
}
