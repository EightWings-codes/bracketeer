import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ActionForm, { inputCls } from "@/components/ActionForm";
import { deleteTournamentAction, resetPlanAction, updateTournamentAction } from "../actions";

const toLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await prisma.tournament.findUnique({ where: { slug }, include: { _count: { select: { slots: true } } } });
  if (!t) notFound();

  return (
    <main className="space-y-6">
      <ActionForm
        action={updateTournamentAction}
        hidden={{ slug, _bools: "allowDraws,testMode" }}
        submitLabel="Save settings"
        className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="block font-medium">Name</span>
            <input name="name" defaultValue={t.name} className={`${inputCls} w-full`} />
          </label>
          <label className="text-sm">
            <span className="block font-medium">Slug</span>
            <input name="newSlug" defaultValue={t.slug} className={`${inputCls} w-full`} />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="block font-medium">Description</span>
            <textarea name="description" defaultValue={t.description ?? ""} rows={2} className={`${inputCls} w-full`} />
          </label>
          <label className="text-sm">
            <span className="block font-medium">Starts at</span>
            <input name="startsAt" type="datetime-local" defaultValue={toLocal(t.startsAt)} className={`${inputCls} w-full`} />
          </label>
          <label className="text-sm">
            <span className="block font-medium">Tables</span>
            <input name="tableCount" type="number" min={1} defaultValue={t.tableCount} className={`${inputCls} w-full`} />
          </label>
          <label className="text-sm">
            <span className="block font-medium">Game duration (min)</span>
            <input name="gameMin" type="number" step="0.5" min={0.5} defaultValue={t.gameDurationSec / 60} className={`${inputCls} w-full`} />
          </label>
          <label className="text-sm">
            <span className="block font-medium">Break (min)</span>
            <input name="breakMin" type="number" step="0.5" min={0} defaultValue={t.breakDurationSec / 60} className={`${inputCls} w-full`} />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="block font-medium">Table labels <span className="font-normal text-zinc-500">(comma-separated, optional)</span></span>
            <input name="tableLabels" defaultValue={t.tableLabels.join(", ")} placeholder="Left table, Right table" className={`${inputCls} w-full`} />
          </label>
          <label className="text-sm">
            <span className="block font-medium">Score label</span>
            <input name="scoreLabel" defaultValue={t.scoreLabel} className={`${inputCls} w-full`} />
          </label>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <label>
              <span className="block font-medium">Win</span>
              <input name="pointsWin" type="number" defaultValue={t.pointsWin} className={`${inputCls} w-full`} />
            </label>
            <label>
              <span className="block font-medium">Draw</span>
              <input name="pointsDraw" type="number" defaultValue={t.pointsDraw} className={`${inputCls} w-full`} />
            </label>
            <label>
              <span className="block font-medium">Loss</span>
              <input name="pointsLoss" type="number" defaultValue={t.pointsLoss} className={`${inputCls} w-full`} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input name="allowDraws" type="checkbox" defaultChecked={t.allowDraws} /> Allow draws
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input name="testMode" type="checkbox" defaultChecked={t.testMode} disabled={t.status !== "DRAFT"} />
            Test mode {t.status !== "DRAFT" && <span className="text-zinc-500">(locked after draft)</span>}
          </label>
        </div>
      </ActionForm>

      <section className="space-y-3 rounded-xl border border-red-300 p-4 dark:border-red-900">
        <h2 className="font-semibold text-red-700 dark:text-red-400">Danger zone</h2>
        {t._count.slots > 0 && (
          <ActionForm action={resetPlanAction} hidden={{ slug }} submitLabel="Remove the whole plan (groups, rounds, matches)" variant="danger" inline />
        )}
        <ActionForm action={deleteTournamentAction} hidden={{ slug, expectedName: t.name }} submitLabel="Delete tournament" variant="danger" inline>
          <input name="confirmName" placeholder={`Type "${t.name}" to confirm`} className={`${inputCls} w-64`} />
        </ActionForm>
      </section>
    </main>
  );
}
