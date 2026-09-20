import Link from "next/link";
import { notFound } from "next/navigation";
import { APP } from "@/lib/config";
import { fmtDelay, loadTournamentView } from "@/lib/view";
import { rememberedTeam } from "@/lib/team-cookie";
import YouAre from "@/components/YouAre";
import AutoRefresh from "@/components/AutoRefresh";
import Countdown from "@/components/Countdown";
import LocalTime from "@/components/LocalTime";
import LiveMatch from "@/components/LiveMatch";
import ScoreForm from "@/components/ScoreForm";
import StandingsTable from "@/components/StandingsTable";
import StatusBadge from "@/components/StatusBadge";
import Bracket from "@/components/Bracket";
import RoundRail, { type Round } from "@/components/RoundRail";
import Tabs, { type Tab } from "@/components/Tabs";

export const dynamic = "force-dynamic";

export default async function Dashboard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const v = await loadTournamentView(slug);
  if (!v) notFound();
  const nowIso = v.now.toISOString();
  const confirmed = v.teams.filter((t) => t.status === "CONFIRMED");
  // Registering (or opening a private link) leaves a token cookie behind, so
  // a player lands on their own match instead of hunting for it.
  const me = await rememberedTeam(slug, v.id);
  const myMatch = me
    ? v.matches.find(
        (m) =>
          (m.teamAId === me.id || m.teamBId === me.id) &&
          m.status !== "CONFIRMED" &&
          m.status !== "VOID" &&
          v.running.some((r) => r.id === m.slotId),
      ) ??
      v.matches.find((m) => (m.teamAId === me.id || m.teamBId === me.id) && m.status === "SCHEDULED")
    : undefined;
  const knockout = v.matches.filter((m) => m.stage !== "GROUP");

  // The rail opens on what is happening now; before the first round that is
  // round one, after the last one it is where the tournament ended.
  const landing = v.running[0] ?? v.next ?? v.slots[v.slots.length - 1] ?? null;
  const startIndex = Math.max(0, v.slots.findIndex((s) => s.id === landing?.id));

  const rounds: Round[] = v.slots.map((s) => {
    const state = s.projection.state;
    const at = state === "running" ? s.projection.projectedEnd : s.projection.projectedStart;
    // A countdown only helps inside the same session; beyond that show the clock.
    const soon = Math.abs(at.getTime() - v.now.getTime()) < 12 * 3600_000;
    const ms = v.matches.filter((m) => m.slotId === s.id);
    return {
      id: s.id,
      label: s.label,
      state,
      caption: v.manualRounds ? (
        `round ${s.index + 1}`
      ) : (
        <>
          {state === "running" ? "ends ~" : state === "done" ? "played ~" : "starts ~"}
          <LocalTime iso={at.toISOString()} withDate={!soon} />
          {state !== "done" && soon && (
            <>
              {" · "}
              <Countdown
                targetIso={at.toISOString()}
                serverNowIso={nowIso}
                className="font-medium"
                overrunLabel={state === "running" ? "over" : "waiting"}
              />
            </>
          )}
          {state !== "done" && s.projection.delaySec > 60 && (
            <span className="ml-2 text-amber-600">{fmtDelay(s.projection.delaySec)}</span>
          )}
        </>
      ),
      content:
        ms.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">Nothing scheduled in this round.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {ms.map((m) => (
              <LiveMatch key={m.id} m={m} tableLabel={v.tableLabel(m.tableNo)} highlightId={me?.id}>
                {state === "running" && v.openScoring && m.status !== "CONFIRMED" && m.teamAId && m.teamBId && (
                  <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
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
              </LiveMatch>
            ))}
          </div>
        ),
    };
  });

  const stages = (
    <div className="space-y-8">
      {v.groups.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Groups</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {v.groups.map((g) => (
              <div key={g.id} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <h3 className="mb-2 font-semibold">{g.name}</h3>
                <StandingsTable
                  rows={v.standings.get(g.id) ?? []}
                  qualify={v.format?.advancePerGroup ?? 0}
                  highlightId={me?.id}
                />
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

      {knockout.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Knockout</h2>
          <Bracket matches={knockout} tableLabel={v.tableLabel} highlightId={me?.id} />
        </section>
      )}

      {v.groups.length === 0 && knockout.length === 0 && (
        <p className="text-sm text-zinc-500">
          No groups or bracket yet — they appear once the organiser locks the field and picks a format.
        </p>
      )}
    </div>
  );

  const schedule = (
    <ol className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
      {v.slots.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
          <div className="flex items-center gap-2">
            <StatusBadge value={s.projection.state} />
            <span className={s.projection.state === "done" ? "text-zinc-500 line-through" : "font-medium"}>{s.label}</span>
          </div>
          <div className="tabular-nums text-zinc-500">
            {v.manualRounds ? (
              <span className="text-xs uppercase tracking-wide">round {s.index + 1}</span>
            ) : (
              <>
                <LocalTime iso={s.projection.projectedStart.toISOString()} /> –{" "}
                <LocalTime iso={s.projection.projectedEnd.toISOString()} />
                {s.projection.state !== "done" && Math.abs(s.projection.delaySec) > 60 && (
                  <span className={s.projection.delaySec > 0 ? "ml-2 text-amber-600" : "ml-2 text-emerald-600"}>
                    {fmtDelay(s.projection.delaySec)}
                  </span>
                )}
              </>
            )}
          </div>
        </li>
      ))}
    </ol>
  );

  const teams = (
    <ul className="flex flex-wrap gap-2 text-sm">
      {v.teams
        .filter((t) => t.status !== "REJECTED")
        .map((t) => (
          <li
            key={t.id}
            className={[
              "rounded-full border px-3 py-1",
              t.id === me?.id
                ? "border-emerald-500 bg-emerald-50 font-medium dark:bg-emerald-950/40"
                : "border-zinc-200 dark:border-zinc-800",
            ].join(" ")}
          >
            {t.name}
            {t.status === "PENDING" && (
              <span className="ml-1 text-amber-500" title="awaiting confirmation">
                •
              </span>
            )}
          </li>
        ))}
      {v.teams.length === 0 && <li className="text-zinc-500">No teams yet.</li>}
    </ul>
  );

  const tabs: Tab[] = [{ id: "stages", label: "Stages", content: stages }];
  if (v.slots.length > 0) tabs.push({ id: "schedule", label: "Schedule", content: schedule });
  tabs.push({ id: "teams", label: `Teams (${confirmed.length})`, content: teams });

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
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

      {me && (
        <YouAre
          slug={slug}
          team={me}
          match={myMatch}
          tableLabel={v.tableLabel}
          scoreLabel={v.scoreLabel}
          live={Boolean(myMatch && v.running.some((r) => r.id === myMatch.slotId))}
        />
      )}

      <RoundRail rounds={rounds} startIndex={startIndex} />

      <Tabs tabs={tabs} />
    </main>
  );
}
