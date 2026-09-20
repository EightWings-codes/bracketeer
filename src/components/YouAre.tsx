import Link from "next/link";
import type { ViewMatch } from "@/lib/view";
import ScoreForm from "./ScoreForm";
import ForgetMe from "./ForgetMe";

/**
 * The remembered team's own strip, pinned above everything else: who you are,
 * which table you are on, and a box to type your result into. The token comes
 * from the cookie, so this works even when open scoring is off — it is the
 * team reporting for itself.
 */
export default function YouAre({
  slug,
  team,
  match,
  tableLabel,
  scoreLabel,
  live,
}: {
  slug: string;
  team: { id: string; name: string; token: string; status: string };
  match: ViewMatch | undefined;
  tableLabel: (n: number) => string;
  scoreLabel: string;
  /** The match is on a round that has actually started. */
  live: boolean;
}) {
  const opponent = match ? (match.teamAId === team.id ? match.labelB : match.labelA) : null;

  return (
    <section className="rounded-2xl border border-emerald-300 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm text-emerald-800 dark:text-emerald-300">
          You are <span className="text-base font-semibold">{team.name}</span>
        </p>
        <div className="flex items-center gap-3 text-xs">
          <Link href={`/t/${slug}/team/${team.token}`} className="text-emerald-700 underline dark:text-emerald-400">
            your matches
          </Link>
          <ForgetMe slug={slug} />
        </div>
      </div>

      {team.status === "PENDING" && (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
          Waiting for the organiser to confirm your entry.
        </p>
      )}

      {match ? (
        <div className="mt-3 border-t border-emerald-200 pt-3 dark:border-emerald-900">
          <p className="text-sm">
            <span className="font-medium">{tableLabel(match.tableNo)}</span> vs{" "}
            <span className="font-medium">{opponent}</span>
            {!live && <span className="text-zinc-500"> · not started yet</span>}
          </p>
          {live && match.status !== "CONFIRMED" && (
            <div className="mt-2">
              <ScoreForm
                matchId={match.id}
                slug={slug}
                teamA={match.labelA}
                teamB={match.labelB}
                teamToken={team.token}
                scoreLabel={scoreLabel}
                askName={false}
              />
            </div>
          )}
        </div>
      ) : (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Nothing to play right now — you&apos;ll see your next match here.
        </p>
      )}
    </section>
  );
}
