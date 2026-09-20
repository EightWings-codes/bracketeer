import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PRESETS, presetsFor, validateFormat, findPreset } from "@/lib/formats";
import { generatePlan } from "@/lib/bracket";
import { randomSeed, seededRng } from "@/lib/rng";
import { confirmedTeamRefs } from "@/lib/tournament";
import ActionForm from "@/components/ActionForm";
import { generatePlanAction, redrawAction } from "../actions";

export default async function FormatPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string; seed?: string }>;
}) {
  const { slug } = await params;
  const { preview, seed: seedParam } = await searchParams;
  const t = await prisma.tournament.findUnique({ where: { slug }, include: { _count: { select: { slots: true } } } });
  if (!t) notFound();
  const teams = await confirmedTeamRefs(prisma, t.id);
  const fitting = new Set(presetsFor(teams.length).map((p) => p.id));
  const hasPlan = t._count.slots > 0;
  const started = hasPlan && (await prisma.slot.count({ where: { tournamentId: t.id, startedAt: { not: null } } })) > 0;

  const previewFormat = preview ? findPreset(preview) : t.formatId ? findPreset(t.formatId) : undefined;
  const seed = seedParam ? Number(seedParam) : t.drawSeed ?? randomSeed();
  let plan: ReturnType<typeof generatePlan> | null = null;
  let problem: string | null = null;
  if (previewFormat) {
    problem = validateFormat(previewFormat, teams.length);
    if (!problem) plan = generatePlan(previewFormat, teams, t.tableCount, seededRng(seed));
  }
  const nameOf = new Map(teams.map((x) => [x.id, x.name]));

  return (
    <main className="space-y-6">
      {t.status !== "LOCKED" && t.status !== "READY" && t.status !== "RUNNING" && (
        <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Lock the field on the <Link href={`/admin/${slug}/teams`} className="underline">teams page</Link> before generating a plan.
          You can still preview formats.
        </p>
      )}
      <p className="text-sm text-zinc-500">
        {teams.length} confirmed teams · {t.tableCount} tables · {t.gameDurationSec / 60} min games, {t.breakDurationSec / 60} min breaks
        {hasPlan && <> · current format <strong>{t.formatId}</strong> (seed {t.drawSeed})</>}
      </p>

      <section className="grid gap-2 sm:grid-cols-2">
        {PRESETS.map((p) => {
          const ok = fitting.has(p.id);
          const active = previewFormat?.id === p.id;
          return (
            <Link
              key={p.id}
              href={ok ? `/admin/${slug}/format?preview=${p.id}&seed=${seed}` : "#"}
              aria-disabled={!ok}
              className={[
                "rounded-xl border p-3 text-sm",
                active ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
                ok ? "hover:border-emerald-500" : "opacity-40",
              ].join(" ")}
            >
              <div className="font-medium">{p.label}</div>
              <div className="text-xs text-zinc-500">{ok ? "fits your field" : validateFormat(p, teams.length)}</div>
            </Link>
          );
        })}
      </section>

      {previewFormat && (
        <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Preview: {previewFormat.label}</h2>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Link href={`/admin/${slug}/format?preview=${previewFormat.id}&seed=${randomSeed()}`} className="rounded-lg border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                Shuffle draw
              </Link>
              {!problem && (t.status === "LOCKED" || t.status === "READY" || t.status === "RUNNING") && (
                <ActionForm
                  action={generatePlanAction}
                  hidden={{ slug, formatId: previewFormat.id, seed, force: started ? "true" : undefined }}
                  submitLabel={hasPlan ? (started ? "⚠ Force regenerate" : "Replace plan") : "Generate plan"}
                  variant={started ? "danger" : "primary"}
                  inline
                />
              )}
            </div>
          </div>
          {problem && <p className="text-red-600">{problem}</p>}
          {plan && (
            <>
              {plan.groups.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-3">
                  {plan.groups.map((g) => (
                    <div key={g.key} className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                      <div className="mb-1 font-semibold">{g.name}</div>
                      <ol className="list-decimal pl-5 text-zinc-600 dark:text-zinc-400">
                        {g.teamIds.map((id) => <li key={id}>{nameOf.get(id)}</li>)}
                      </ol>
                    </div>
                  ))}
                </div>
              )}
              <ol className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                {plan.slots.map((s) => {
                  const startMin = plan!.slots.slice(0, s.index).reduce((acc) => acc + t.gameDurationSec + t.breakDurationSec, 0) / 60;
                  return (
                    <li key={s.index} className="flex flex-wrap gap-3 py-2">
                      <span className="w-40 font-medium">{s.label}</span>
                      <span className="w-16 text-zinc-500">+{startMin} min</span>
                      <span className="text-zinc-600 dark:text-zinc-400">
                        {plan!.matches
                          .filter((m) => m.slotIndex === s.index)
                          .map((m) => `${describe(m.sourceA, nameOf)} – ${describe(m.sourceB, nameOf)}`)
                          .join(" · ")}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <p className="text-xs text-zinc-500">
                {plan.slots.length} rounds ≈ {((plan.slots.length * t.gameDurationSec + (plan.slots.length - 1) * t.breakDurationSec) / 60).toFixed(0)} min total.
              </p>
            </>
          )}
        </section>
      )}

      {hasPlan && !started && (
        <section className="text-sm">
          <ActionForm action={redrawAction} hidden={{ slug }} submitLabel="Re-draw groups with a new random seed (same format)" variant="secondary" inline />
        </section>
      )}
    </main>
  );
}

function describe(s: import("@/lib/bracket").PlanSource, nameOf: Map<string, string>): string {
  switch (s.kind) {
    case "TEAM":
      return nameOf.get(s.teamId) ?? "?";
    case "GROUP_RANK":
      return `${s.rank === 1 ? "1st" : s.rank === 2 ? "2nd" : `${s.rank}th`} ${s.groupKey}`;
    case "WILDCARD":
      return `Best 3rd #${s.rank}`;
    case "WINNER":
      return `W ${s.matchKey}`;
    case "LOSER":
      return `L ${s.matchKey}`;
  }
}
