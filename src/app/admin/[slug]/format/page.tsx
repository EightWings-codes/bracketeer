import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  CUSTOM_ID,
  PRESETS,
  customFormat,
  customInputOf,
  describeCustom,
  describeFormat,
  describeGroupsShort,
  findPreset,
  groupOptions,
  isPowerOfTwo,
  playoffLabel,
  playoffOptions,
  presetsFor,
  validateFormat,
  type FormatConfig,
} from "@/lib/formats";
import { generatePlan } from "@/lib/bracket";
import { randomSeed, seededRng } from "@/lib/rng";
import { confirmedTeamRefs } from "@/lib/tournament";
import { parseStageTiming, planDurationSec, slotTimings } from "@/lib/stage-timing";
import ActionForm from "@/components/ActionForm";
import { generatePlanAction, redrawAction, replanPlayoffAction } from "../actions";

const CHIP = "rounded-lg border px-3 py-1.5 text-sm";
const CHIP_ON = "border-emerald-500 bg-emerald-50 font-medium dark:bg-emerald-950/40";
const CHIP_OFF = "border-zinc-300 hover:border-emerald-400 dark:border-zinc-700";

const minutes = (sec: number) => Math.round(sec / 60);

export default async function FormatPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    preview?: string;
    seed?: string;
    groups?: string;
    playoff?: string;
    third?: string;
    elim?: string;
    places?: string;
  }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const t = await prisma.tournament.findUnique({ where: { slug }, include: { _count: { select: { slots: true } } } });
  if (!t) notFound();
  const teams = await confirmedTeamRefs(prisma, t.id);
  const teamCount = teams.length;
  const fitting = new Set(presetsFor(teamCount).map((p) => p.id));
  const hasPlan = t._count.slots > 0;
  const started = hasPlan && (await prisma.slot.count({ where: { tournamentId: t.id, startedAt: { not: null } } })) > 0;
  // Once the group stage is under way the whole plan can no longer be redrawn,
  // but the playoff hanging off it still can — until the playoff itself starts.
  const playoffStarted =
    hasPlan &&
    (await prisma.slot.count({
      where: { tournamentId: t.id, stage: { not: "GROUP" }, OR: [{ startedAt: { not: null } }, { endedAt: { not: null } }] },
    })) > 0;
  const canReplanPlayoff = started && !playoffStarted && (await prisma.group.count({ where: { tournamentId: t.id } })) > 0;
  const stageTiming = parseStageTiming(t.stageTiming);

  // --- what is being previewed -------------------------------------------
  // The builder wins when it is in the URL; otherwise a preset, otherwise
  // whatever this tournament is already set to.
  const layouts = groupOptions(teamCount);
  // A knockout without groups only works on a power-of-two field.
  const straightKnockout = isPowerOfTwo(teamCount) && teamCount >= 4;
  const groupChoices = straightKnockout ? [0, ...layouts] : layouts;
  const building = sp.groups !== undefined || sp.playoff !== undefined;
  // With nothing in the URL the builder opens on the plan this tournament
  // already has, so the page always describes what is really set.
  const stored = t.formatConfig as FormatConfig | null;
  const openOn = stored && stored.id === CUSTOM_ID ? customInputOf(stored, teamCount) : null;
  const groupCount = clampChoice(Number(sp.groups), groupChoices, openOn?.groupCount ?? defaultGroups(layouts));
  const playoffs = playoffOptions(teamCount, groupCount);
  const playoffSize = clampChoice(
    Number(sp.playoff),
    playoffs,
    openOn && playoffs.includes(openOn.playoffSize) ? openOn.playoffSize : (playoffs[playoffs.length - 1] ?? 0),
  );
  const thirdPlace = building ? sp.third === "1" : (sp.third === "1" || Boolean(openOn?.thirdPlaceMatch));
  const places = groupCount === 2 && (building ? sp.places === "1" : sp.places === "1" || Boolean(openOn?.placementGames));
  // Double elimination replaces the single-elimination playoff; it takes no
  // group stage and no third-place match, so it is only offered on its own.
  const double =
    (building ? sp.elim === "DOUBLE" : sp.elim === "DOUBLE" || openOn?.elimination === "DOUBLE") &&
    groupCount === 0 &&
    straightKnockout;

  const customInput = {
    teamCount,
    groupCount,
    playoffSize,
    thirdPlaceMatch: thirdPlace && !double,
    placementGames: places && !double,
    elimination: double ? ("DOUBLE" as const) : ("SINGLE" as const),
  };
  const custom: FormatConfig | null = teamCount >= 2 ? customFormat(customInput) : null;

  // Show something from the first visit: the builder's own default when this
  // tournament has no format yet, otherwise whatever it is already set to.
  const previewFormat = building
    ? custom
    : sp.preview
      ? (findPreset(sp.preview) ?? null)
      : t.formatId
        ? (findPreset(t.formatId) ?? stored)
        : custom;

  const seed = sp.seed ? Number(sp.seed) : (t.drawSeed ?? randomSeed());
  let plan: ReturnType<typeof generatePlan> | null = null;
  let problem: string | null = null;
  if (previewFormat) {
    problem = validateFormat(previewFormat, teamCount);
    if (!problem) plan = generatePlan(previewFormat, teams, t.tableCount, seededRng(seed));
  }
  const nameOf = new Map(teams.map((x) => [x.id, x.name]));

  const build = (patch: Partial<{ groups: number; playoff: number; third: boolean; double: boolean; places: boolean; seed: number }>) => {
    const q = new URLSearchParams({
      groups: String(patch.groups ?? groupCount),
      playoff: String(patch.playoff ?? playoffSize),
      third: (patch.third ?? thirdPlace) ? "1" : "0",
      elim: (patch.double ?? double) ? "DOUBLE" : "SINGLE",
      places: (patch.places ?? places) ? "1" : "0",
      seed: String(patch.seed ?? seed),
    });
    return `/admin/${slug}/format?${q}`;
  };

  return (
    <main className="space-y-6">
      {t.status !== "LOCKED" && t.status !== "READY" && t.status !== "RUNNING" && (
        <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Lock the field on the <Link href={`/admin/${slug}/teams`} className="underline">teams page</Link> before generating a plan.
          You can still preview formats.
        </p>
      )}
      <p className="text-sm text-zinc-500">
        {teamCount} confirmed teams · {t.tableCount} tables · {minutes(t.gameDurationSec)} min games,{" "}
        {minutes(t.breakDurationSec)} min breaks by default
        {hasPlan && <> · current format <strong>{t.formatId}</strong> (seed {t.drawSeed})</>}
      </p>

      {/* ---------------------------------------------------------- builder */}
      <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <h2 className="font-semibold">Build the day</h2>
          <p className="text-sm text-zinc-500">
            The group stage and the playoff are two separate choices — three groups of four can feed quarter-finals
            or go straight to semi-finals.
          </p>
        </div>

        {teamCount < 2 ? (
          <p className="text-sm text-zinc-500">Confirm at least two teams to build a format.</p>
        ) : (
          <>
            <Choice label="Group stage">
              {straightKnockout && (
                <Chip href={build({ groups: 0, playoff: teamCount })} on={groupCount === 0}>
                  None — straight knockout
                </Chip>
              )}
              {layouts.map((g) => (
                <Chip key={g} href={build({ groups: g })} on={groupCount === g}>
                  {describeGroupsShort(teamCount, g)}
                </Chip>
              ))}
            </Choice>

            <Choice label="Playoff starts at">
              {playoffs.map((q) => (
                <Chip key={q} href={build({ playoff: q })} on={playoffSize === q}>
                  {playoffLabel(q)}
                  {q > 0 && groupCount > 0 && (
                    <span className="ml-1 text-xs text-zinc-500">({q} qualify)</span>
                  )}
                </Chip>
              ))}
            </Choice>

            <Choice label="Extras">
              <Chip href={build({ third: !thirdPlace })} on={thirdPlace && !double}>
                {thirdPlace && !double ? "✓ " : ""}3rd place match
              </Chip>
              {groupCount === 2 && playoffSize >= 2 && (
                <Chip href={build({ places: !places })} on={places}>
                  {places ? "✓ " : ""}Play out 5th, 7th …
                </Chip>
              )}
              {groupCount === 0 && straightKnockout && (
                <Chip href={build({ double: !double })} on={double}>
                  {double ? "✓ " : ""}Double elimination
                </Chip>
              )}
              <Link href={build({ seed: randomSeed() })} className={`${CHIP} ${CHIP_OFF}`} scroll={false}>
                ↻ Shuffle draw
              </Link>
            </Choice>

            {custom && (
              <p className="text-sm">
                <span className="text-zinc-500">This makes:</span>{" "}
                <strong>{describeCustom(customInput)}</strong>
              </p>
            )}
          </>
        )}
      </section>

      {/* ---------------------------------------------------------- presets */}
      <details className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900" open={!building && Boolean(sp.preview)}>
        <summary className="cursor-pointer font-semibold">Or start from a preset</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {PRESETS.map((p) => {
            const ok = fitting.has(p.id);
            const active = !building && previewFormat?.id === p.id;
            return (
              <Link
                key={p.id}
                href={ok ? `/admin/${slug}/format?preview=${p.id}&seed=${seed}` : "#"}
                aria-disabled={!ok}
                className={[
                  "rounded-xl border p-3",
                  active ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" : "border-zinc-200 dark:border-zinc-800",
                  ok ? "hover:border-emerald-500" : "opacity-40",
                ].join(" ")}
              >
                <div className="font-medium">{p.label}</div>
                <div className="text-xs text-zinc-500">{ok ? "fits your field" : validateFormat(p, teamCount)}</div>
              </Link>
            );
          })}
        </div>
      </details>

      {/* ---------------------------------------------------------- preview */}
      {previewFormat && (
        <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              Preview: {describeFormat(previewFormat, teamCount)}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {!building && (
                <Link
                  href={`/admin/${slug}/format?preview=${previewFormat.id}&seed=${randomSeed()}`}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  Shuffle draw
                </Link>
              )}
              {!problem && (t.status === "LOCKED" || t.status === "READY" || t.status === "RUNNING") && (
                <ActionForm
                  action={generatePlanAction}
                  hidden={{
                    slug,
                    formatId: previewFormat.id,
                    seed,
                    groupCount: previewFormat.id === CUSTOM_ID ? groupCount : undefined,
                    playoffSize: previewFormat.id === CUSTOM_ID ? playoffSize : undefined,
                    thirdPlace: previewFormat.id === CUSTOM_ID ? (thirdPlace && !double ? "true" : "false") : undefined,
                    places: previewFormat.id === CUSTOM_ID ? (places && !double ? "true" : "false") : undefined,
                    elimination: previewFormat.id === CUSTOM_ID ? (double ? "DOUBLE" : "SINGLE") : undefined,
                    force: started ? "true" : undefined,
                  }}
                  submitLabel={hasPlan ? (started ? "⚠ Force regenerate (wipes results)" : "Replace plan") : "Generate plan"}
                  variant={started ? "danger" : "primary"}
                  inline
                />
              )}
              {canReplanPlayoff && previewFormat.id === CUSTOM_ID && !problem && (
                <ActionForm
                  action={replanPlayoffAction}
                  hidden={{
                    slug,
                    formatId: CUSTOM_ID,
                    groupCount,
                    playoffSize,
                    thirdPlace: thirdPlace && !double ? "true" : "false",
                    places: places && !double ? "true" : "false",
                  }}
                  submitLabel="Re-plan the playoff only"
                  pendingLabel="Re-planning…"
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
              <PlanRounds plan={plan} nameOf={nameOf} t={t} timing={stageTiming} />
            </>
          )}
        </section>
      )}

      {canReplanPlayoff && (
        <p className="rounded-xl border border-indigo-300 bg-indigo-50 p-3 text-sm dark:border-indigo-900 dark:bg-indigo-950/40">
          The group stage is running, so the draw is fixed — but the playoff above it is not. Pick the shape you want and
          use <strong>Re-plan the playoff only</strong>: groups, results and the rounds already played stay untouched.
        </p>
      )}

      {hasPlan && !started && (
        <section className="text-sm">
          <ActionForm action={redrawAction} hidden={{ slug }} submitLabel="Re-draw groups with a new random seed (same format)" variant="secondary" inline />
        </section>
      )}
    </main>
  );
}

function Choice({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-32 shrink-0 text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}

function Chip({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} scroll={false} className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}>
      {children}
    </Link>
  );
}

/** Round list with the running clock, so a stage timing change is visible here. */
function PlanRounds({
  plan,
  nameOf,
  t,
  timing,
}: {
  plan: ReturnType<typeof generatePlan>;
  nameOf: Map<string, string>;
  t: { gameDurationSec: number; breakDurationSec: number };
  timing: ReturnType<typeof parseStageTiming>;
}) {
  const timings = slotTimings(plan.slots, timing, t);
  let cursor = 0;
  const rows = plan.slots.map((s) => {
    const at = cursor;
    const st = timings.get(s.index)!;
    cursor += st.durationSec + st.breakAfterSec;
    return { s, at, st };
  });
  const total = planDurationSec(plan.slots, timing, t);

  return (
    <>
      <ol className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
        {rows.map(({ s, at, st }) => (
          <li key={s.index} className="flex flex-wrap gap-3 py-2">
            <span className="w-40 font-medium">{s.label}</span>
            <span className="w-28 text-zinc-500 tabular-nums">
              +{minutes(at)} min · {minutes(st.durationSec)}′
            </span>
            <span className="text-zinc-600 dark:text-zinc-400">
              {plan.matches
                .filter((m) => m.slotIndex === s.index)
                .map((m) => `${describe(m.sourceA, nameOf)} – ${describe(m.sourceB, nameOf)}`)
                .join(" · ")}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-zinc-500">
        {plan.slots.length} rounds
        {" "}≈ {minutes(total)} min total — set per-stage times on the schedule tab.
      </p>
    </>
  );
}

/** Pick `raw` when it is one of the offered values, else the fallback. */
function clampChoice(raw: number, options: number[], fallback: number): number {
  return Number.isFinite(raw) && options.includes(raw) ? raw : fallback;
}

/** Groups of about four are the usual shape, so open on the closest to that. */
function defaultGroups(layouts: number[]): number {
  if (layouts.length === 0) return 0;
  return layouts.reduce((best, g) => (Math.abs(g - 3) < Math.abs(best - 3) ? g : best), layouts[0]!);
}

function describe(s: import("@/lib/bracket").PlanSource, nameOf: Map<string, string>): string {
  switch (s.kind) {
    case "TEAM":
      return nameOf.get(s.teamId) ?? "?";
    case "GROUP_RANK":
      return `${s.rank === 1 ? "1st" : s.rank === 2 ? "2nd" : `${s.rank}th`} ${s.groupKey}`;
    case "WILDCARD":
      return `Best #${s.rank}`;
    case "WINNER":
      return `W ${s.matchKey}`;
    case "LOSER":
      return `L ${s.matchKey}`;
  }
}
