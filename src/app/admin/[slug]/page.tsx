import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { APP } from "@/lib/config";
import { publicTournamentUrl } from "@/lib/public-url";
import { fmtDelay, loadTournamentView } from "@/lib/view";
import AutoRefresh from "@/components/AutoRefresh";
import Countdown from "@/components/Countdown";
import LocalTime from "@/components/LocalTime";
import LocalDateTimeInput from "@/components/LocalDateTimeInput";
import MatchRow from "@/components/MatchRow";
import QrCode from "@/components/QrCode";
import StatusBadge from "@/components/StatusBadge";
import ActionForm from "@/components/ActionForm";
import { inputCls } from "@/components/ui";
import {
  confirmMatchAction,
  newJoinCodeAction,
  nudgeClockAction,
  setStatusAction,
  startSlotAction,
  stopSlotAction,
  updateTournamentAction,
  voidMatchAction,
} from "./actions";

export default async function ControlRoom({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const v = await loadTournamentView(slug);
  if (!v) notFound();
  const nowIso = v.now.toISOString();
  const clock = v.clock;
  // The break timer belongs to the round that was just stopped.
  const breakSlot = clock.phase === "break" ? v.slots.find((x) => x.index === clock.afterIndex) : undefined;
  const publicUrl = await publicTournamentUrl(slug);
  const audit = await prisma.auditLog.findMany({ where: { tournamentId: v.id }, orderBy: { createdAt: "desc" }, take: 20 });
  const pending = v.teams.filter((t) => t.status === "PENDING").length;
  const confirmed = v.teams.filter((t) => t.status === "CONFIRMED").length;

  const queue = v.matches.filter(
    (m) => m.status === "REPORTED" || (m.projection.state === "running" && m.status === "SCHEDULED" && m.teamAId && m.teamBId),
  );
  const outOfSync = v.matches.filter(
    (m) =>
      (m.sourceAKind !== "TEAM" || m.sourceBKind !== "TEAM") &&
      (m.status === "REPORTED" || m.status === "CONFIRMED" || m.projection.state !== "upcoming") &&
      (!m.teamAId || !m.teamBId),
  );

  return (
    <main className="space-y-8">
      <AutoRefresh intervalMs={APP.pollIntervalMs} />

      {/* Phase controls */}
      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mr-auto text-sm text-zinc-500">
          {confirmed} confirmed{pending > 0 && <>, <Link href={`/admin/${slug}/teams`} className="text-amber-600 hover:underline">{pending} pending</Link></>} ·{" "}
          {v.slots.length} rounds · {v.matches.length} matches
        </div>
        {v.status === "DRAFT" && (
          <ActionForm action={setStatusAction} hidden={{ slug, status: "REGISTRATION" }} submitLabel="Open registration" inline />
        )}
        {v.status === "REGISTRATION" && (
          <ActionForm action={setStatusAction} hidden={{ slug, status: "LOCKED" }} submitLabel="Lock the field" inline />
        )}
        {v.status === "LOCKED" && v.slots.length === 0 && (
          <Link href={`/admin/${slug}/format`} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500">
            Choose a format →
          </Link>
        )}
        {/* The schedule exists but nobody has signed it off yet. */}
        {v.status === "LOCKED" && v.slots.length > 0 && (
          <ActionForm
            action={setStatusAction}
            hidden={{ slug, status: "READY" }}
            submitLabel="✓ Confirm schedule"
            inline
          />
        )}
        {v.status === "READY" && (
          <>
            <ActionForm
              action={startSlotAction}
              hidden={{ slug, slotId: v.slots[0]?.id }}
              submitLabel="▶ Start tournament"
              inline
            />
            <ActionForm
              action={setStatusAction}
              hidden={{ slug, status: "LOCKED" }}
              submitLabel="Back to planning"
              variant="ghost"
              inline
            />
          </>
        )}
        {(v.status === "LOCKED" || v.status === "READY" || v.status === "RUNNING") && (
          <ActionForm action={setStatusAction} hidden={{ slug, status: "FINISHED" }} submitLabel="Finish" variant="secondary" inline />
        )}
        {v.status === "FINISHED" && (
          <ActionForm action={setStatusAction} hidden={{ slug, status: "RUNNING" }} submitLabel="Re-open" variant="secondary" inline />
        )}
      </section>

      {/* Share */}
      <section className="flex flex-wrap items-center gap-5 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <QrCode value={publicUrl} size={140} />
        <div className="min-w-0 space-y-1 text-sm">
          <div className="text-base font-medium">Scan to join</div>
          <div className="break-all font-mono text-zinc-500">{publicUrl}</div>
          <p className="text-zinc-500">
            {v.joinCodeEnabled ? <>Leads to the public dashboard — teams still need the join code <span className="font-mono">{v.joinCode}</span>.</> : <>Leads to the public dashboard, where anyone can register.</>}
          </p>
          <a href={`/admin/${slug}/qr`} className="inline-block text-emerald-600 hover:underline" download>
            Download SVG ↓
          </a>
        </div>
      </section>

      {/* Gates */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium">Join code</span>
            <ActionForm
              action={updateTournamentAction}
              hidden={{ slug, _bools: "joinCodeEnabled", joinCodeEnabled: v.joinCodeEnabled ? "false" : "true" }}
              submitLabel={v.joinCodeEnabled ? "Turn off" : "Turn on"}
              variant="secondary"
              inline
            />
          </div>
          {v.joinCodeEnabled ? (
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-zinc-100 px-3 py-1 font-mono text-2xl tracking-widest dark:bg-zinc-800">{v.joinCode}</span>
              <ActionForm action={newJoinCodeAction} hidden={{ slug }} submitLabel="New code" variant="ghost" inline />
            </div>
          ) : (
            <p className="text-zinc-500">Anyone with the link can register.</p>
          )}
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium">Score entry</span>
            <ActionForm
              action={updateTournamentAction}
              hidden={{ slug, _bools: "openScoring", openScoring: v.openScoring ? "false" : "true" }}
              submitLabel={v.openScoring ? "Team links only" : "Open to anyone"}
              variant="secondary"
              inline
            />
          </div>
          <p className="text-zinc-500">
            {v.openScoring ? "Anyone on the dashboard can report a result." : "Only teams via their private link can report."} You confirm
            every result.
          </p>
        </div>
      </section>

      {/* Clock */}
      {v.slots.length > 0 && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          {!v.manualRounds && v.delaySec > 60 && (
            <div className="mb-3 rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              Running {fmtDelay(v.delaySec)}.
            </div>
          )}
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase text-zinc-500">Running</div>
              {v.running.length === 0 && <div className="text-zinc-500">Nothing running</div>}
              {v.running.map((s) => (
                <div key={s.id} className="mb-3">
                  <div className="text-xl font-semibold">{s.label}</div>
                  {v.manualRounds ? (
                    <>
                      <Countdown
                        targetIso={(v.clock.phase === "game" && v.clock.index === s.index ? v.clock.endsAt : s.projection.projectedEnd).toISOString()}
                        serverNowIso={nowIso}
                        stopAtZero
                        overrunLabel="time's up"
                        className="text-5xl font-bold tabular-nums"
                      />
                      <Nudge slug={slug} slotId={s.id} timer="game" />
                    </>
                  ) : (
                    <Countdown targetIso={s.projection.projectedEnd.toISOString()} serverNowIso={nowIso} className="text-5xl font-bold tabular-nums" />
                  )}
                  <div className="mt-2">
                    <ActionForm action={stopSlotAction} hidden={{ slug, slotId: s.id }} submitLabel="■ Stop round" variant="danger" inline />
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div className="text-xs uppercase text-zinc-500">Next</div>
              {v.next ? (
                <div>
                  <div className="text-xl font-semibold">{v.next.label}</div>
                  <div className="text-sm text-zinc-500">
                    planned ~<LocalTime iso={v.next.projection.projectedStart.toISOString()} />
                    {!v.manualRounds && v.next.projection.delaySec > 60 && ` (${fmtDelay(v.next.projection.delaySec)})`}
                  </div>
                  {!v.manualRounds ? (
                    <Countdown targetIso={v.next.projection.projectedStart.toISOString()} serverNowIso={nowIso} className="text-3xl font-bold tabular-nums" overrunLabel="ready" />
                  ) : v.clock.phase === "break" || v.clock.phase === "prestart" ? (
                    <>
                      <div className="mt-1 text-xs uppercase text-zinc-500">{v.clock.phase === "break" ? "Break" : "Starts in"}</div>
                      <Countdown
                        targetIso={v.clock.endsAt.toISOString()}
                        serverNowIso={nowIso}
                        stopAtZero
                        overrunLabel="ready"
                        className="text-3xl font-bold tabular-nums"
                      />
                      {breakSlot && <Nudge slug={slug} slotId={breakSlot.id} timer="break" />}
                    </>
                  ) : null}
                  {v.clock.phase === "prestart" && (
                    <ActionForm action={updateTournamentAction} hidden={{ slug }} submitLabel="Set start" variant="secondary" inline className="mt-2">
                      <LocalDateTimeInput name="startsAt" iso={v.startsAt.toISOString()} className={inputCls} required />
                    </ActionForm>
                  )}
                  <div className="mt-2">
                    <ActionForm action={startSlotAction} hidden={{ slug, slotId: v.next.id }} submitLabel="▶ Start round" inline />
                  </div>
                  <ul className="mt-3 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {v.matches
                      .filter((m) => m.slotId === v.next!.id)
                      .map((m) => (
                        <li key={m.id}>
                          {v.tableLabel(m.tableNo)}: {m.labelA} – {m.labelB}
                        </li>
                      ))}
                  </ul>
                </div>
              ) : (
                <div className="text-zinc-500">No more rounds</div>
              )}
            </div>
          </div>
        </section>
      )}

      {outOfSync.length > 0 && (
        <section className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <strong>Bracket out of sync:</strong> {outOfSync.length} match(es) have started or been reported but their teams are no longer
          decided by the results. Fix them in the <Link href={`/admin/${slug}/schedule`} className="underline">schedule</Link>.
        </section>
      )}

      {/* Confirm queue */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          Results to confirm <span className="text-base font-normal text-zinc-500">({queue.length})</span>
        </h2>
        {queue.length === 0 && <p className="text-sm text-zinc-500">Nothing waiting.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {queue.map((m) => {
            const latest = m.reports[0];
            const byTeam = (id: string | null) => m.reports.filter((r) => r.reportedForTeamId === id);
            return (
              <MatchRow key={m.id} m={m} tableLabel={v.tableLabel(m.tableNo)}>
                <div className="mt-2 space-y-2 border-t border-zinc-100 pt-2 text-sm dark:border-zinc-800">
                  {m.reports.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 text-xs text-zinc-500">
                      <div>
                        <div className="font-medium">{m.labelA} says</div>
                        {byTeam(m.teamAId).map((r) => <div key={r.id}>{r.scoreA}:{r.scoreB}</div>)}
                        {byTeam(m.teamAId).length === 0 && <div>—</div>}
                      </div>
                      <div>
                        <div className="font-medium">{m.labelB} says</div>
                        {byTeam(m.teamBId).map((r) => <div key={r.id}>{r.scoreA}:{r.scoreB}</div>)}
                        {byTeam(m.teamBId).length === 0 && <div>—</div>}
                      </div>
                      {m.reports.filter((r) => !r.reportedForTeamId).length > 0 && (
                        <div className="col-span-2">
                          Open reports:{" "}
                          {m.reports.filter((r) => !r.reportedForTeamId).map((r) => `${r.scoreA}:${r.scoreB}${r.reportedBy ? ` (${r.reportedBy})` : ""}`).join(", ")}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <ActionForm action={confirmMatchAction} hidden={{ slug, matchId: m.id }} submitLabel="Confirm" pendingLabel="Confirming…" inline>
                      <input name="scoreA" type="number" min={0} defaultValue={latest?.scoreA ?? m.scoreA ?? ""} required className={`${inputCls} w-16`} aria-label={`${m.labelA} score`} />
                      <span className="text-zinc-400">:</span>
                      <input name="scoreB" type="number" min={0} defaultValue={latest?.scoreB ?? m.scoreB ?? ""} required className={`${inputCls} w-16`} aria-label={`${m.labelB} score`} />
                    </ActionForm>
                    <ActionForm action={voidMatchAction} hidden={{ slug, matchId: m.id }} submitLabel="Void" variant="ghost" inline />
                  </div>
                </div>
              </MatchRow>
            );
          })}
        </div>
      </section>

      {/* Audit */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Recent changes</h2>
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white text-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {audit.length === 0 && <li className="p-3 text-zinc-500">No changes yet.</li>}
          {audit.map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline gap-2 px-3 py-2">
              <LocalTime iso={a.createdAt.toISOString()} className="w-12 shrink-0 tabular-nums text-zinc-500" />
              <StatusBadge value={a.action.split(".")[0] ?? ""} className="!bg-zinc-100 !text-zinc-600 dark:!bg-zinc-800 dark:!text-zinc-300" />
              <span className="font-medium">{a.action}</span>
              <span className="truncate text-zinc-500">{summarise(a.detail)}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function summarise(detail: unknown): string {
  if (!detail || typeof detail !== "object") return "";
  return Object.entries(detail as Record<string, unknown>)
    .filter(([k]) => !["outOfSync"].includes(k))
    .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" ")
    .slice(0, 140);
}

/** −1′ / +1′ on a live manual timer — lands on that round's own override. */
function Nudge({ slug, slotId, timer }: { slug: string; slotId: string; timer: "game" | "break" }) {
  return (
    <div className="mt-1 flex gap-1">
      {[-60, 60].map((d) => (
        <ActionForm
          key={d}
          action={nudgeClockAction}
          hidden={{ slug, slotId, timer, deltaSec: d }}
          submitLabel={d < 0 ? "−1 min" : "+1 min"}
          variant="secondary"
          inline
        />
      ))}
    </div>
  );
}
