import Link from "next/link";
import { notFound } from "next/navigation";
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

export default async function Dashboard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const v = await loadTournamentView(slug);
  if (!v) notFound();
  const nowIso = v.now.toISOString();
  const confirmed = v.teams.filter((t) => t.status === "CONFIRMED");
  const knockout = v.matches.filter((m) => m.stage !== "GROUP");

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-4 sm:p-6">
      <AutoRefresh intervalMs={APP.pollIntervalMs} />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{v.name}</h1>
            <StatusBadge value={v.status} />
            {v.testMode && <StatusBadge value="TEST" />}
          </div>
          {v.description && <p className="mt-1 text-zinc-500">{v.description}</p>}
          <p className="mt-1 text-sm text-zinc-500">
            Starts <LocalTime iso={v.startsAt.toISOString()} withDate /> · {confirmed.length} teams ·{" "}
            {v.tableCount} {v.tableCount === 1 ? "table" : "tables"}
          </p>
        </div>
        {v.status === "REGISTRATION" && (
          <Link
            href={`/t/${slug}/register`}
            className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500"
          >
            Register a team
          </Link>
        )}
      </header>

      {/* Clock */}
      {v.slots.length > 0 && v.status !== "FINISHED" && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          {v.delaySec > 60 && (
            <div className="mb-3 rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              Running {fmtDelay(v.delaySec)} — times below have been re-planned.
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase text-zinc-500">Now</div>
              {v.running.length > 0 ? (
                v.running.map((s) => (
                  <div key={s.id}>
                    <div className="text-xl font-semibold">{s.label}</div>
                    <Countdown
                      targetIso={s.projection.projectedEnd.toISOString()}
                      serverNowIso={nowIso}
                      className="text-5xl font-bold tabular-nums"
                    />
                    <div className="text-sm text-zinc-500">
                      ends ~<LocalTime iso={s.projection.projectedEnd.toISOString()} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xl text-zinc-500">Break</div>
              )}
            </div>
            <div>
              <div className="text-xs uppercase text-zinc-500">Next up</div>
              {v.next ? (
                <div>
                  <div className="text-xl font-semibold">{v.next.label}</div>
                  <Countdown
                    targetIso={v.next.projection.projectedStart.toISOString()}
                    serverNowIso={nowIso}
                    className="text-5xl font-bold tabular-nums"
                    overrunLabel="waiting"
                  />
                  <div className="text-sm text-zinc-500">
                    ~<LocalTime iso={v.next.projection.projectedStart.toISOString()} />
                    {v.next.projection.delaySec > 60 && ` (${fmtDelay(v.next.projection.delaySec)})`}
                  </div>
                </div>
              ) : (
                <div className="text-xl text-zinc-500">That was the last round</div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Running matches */}
      {v.running.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">On the tables</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {v.matches
              .filter((m) => v.running.some((s) => s.id === m.slotId))
              .map((m) => (
                <MatchRow key={m.id} m={m} tableLabel={v.tableLabel(m.tableNo)}>
                  {v.openScoring && m.status !== "CONFIRMED" && m.teamAId && m.teamBId && (
                    <div className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                      <ScoreForm
                        matchId={m.id}
                        slug={slug}
                        teamA={m.labelA}
                        teamB={m.labelB}
                        scoreLabel={v.scoreLabel}
                        askName
                      />
                    </div>
                  )}
                </MatchRow>
              ))}
          </div>
        </section>
      )}

      {/* Schedule */}
      {v.slots.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Schedule</h2>
          <ol className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {v.slots.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <StatusBadge value={s.projection.state} />
                  <span className={s.projection.state === "done" ? "text-zinc-500 line-through" : "font-medium"}>
                    {s.label}
                  </span>
                </div>
                <div className="tabular-nums text-zinc-500">
                  <LocalTime iso={s.projection.projectedStart.toISOString()} /> –{" "}
                  <LocalTime iso={s.projection.projectedEnd.toISOString()} />
                  {s.projection.state !== "done" && Math.abs(s.projection.delaySec) > 60 && (
                    <span className={s.projection.delaySec > 0 ? "ml-2 text-amber-600" : "ml-2 text-emerald-600"}>
                      {fmtDelay(s.projection.delaySec)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Groups */}
      {v.groups.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Groups</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {v.groups.map((g) => (
              <div key={g.id} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <h3 className="mb-2 font-semibold">{g.name}</h3>
                <StandingsTable rows={v.standings.get(g.id) ?? []} qualify={v.format?.advancePerGroup ?? 0} />
                <ul className="mt-3 space-y-1 text-sm">
                  {v.matches
                    .filter((m) => m.groupId === g.id)
                    .map((m) => (
                      <li key={m.id} className="flex justify-between gap-2 text-zinc-600 dark:text-zinc-400">
                        <span className="truncate">
                          {m.labelA} – {m.labelB}
                        </span>
                        <span className="tabular-nums">
                          {m.status === "CONFIRMED" ? `${m.scoreA}:${m.scoreB}` : m.status === "REPORTED" ? "reported" : m.slotLabel}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Bracket */}
      {knockout.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Knockout</h2>
          <Bracket matches={knockout} tableLabel={v.tableLabel} />
        </section>
      )}

      {v.status === "REGISTRATION" && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Registered teams</h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {v.teams
              .filter((t) => t.status !== "REJECTED")
              .map((t) => (
                <li key={t.id} className="rounded-full border border-zinc-200 px-3 py-1 dark:border-zinc-800">
                  {t.name}
                  {t.status === "PENDING" && <span className="ml-1 text-amber-500" title="awaiting confirmation">•</span>}
                </li>
              ))}
          </ul>
        </section>
      )}
    </main>
  );
}
