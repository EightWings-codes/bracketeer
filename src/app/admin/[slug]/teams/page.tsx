import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import StatusBadge from "@/components/StatusBadge";
import TeamIcon from "@/components/TeamIcon";
import { findTheme, parseIconArt } from "@/lib/themes";
import ActionForm from "@/components/ActionForm";
import { inputCls } from "@/components/ui";
import { addTeamAction, deleteTeamAction, setStatusAction, teamStatusAction, updateTeamAction } from "../actions";

export default async function TeamsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await prisma.tournament.findUnique({
    where: { slug },
    include: { teams: { orderBy: [{ status: "asc" }, { createdAt: "asc" }], include: { group: true } } },
  });
  if (!t) notFound();
  const art = parseIconArt(t.theme, t.iconArt);
  const counts = { PENDING: 0, CONFIRMED: 0, REJECTED: 0 };
  for (const team of t.teams) counts[team.status]++;

  return (
    <main className="space-y-6">
      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mr-auto">
          <span className="font-semibold">{counts.CONFIRMED} confirmed</span> · {counts.PENDING} pending · {counts.REJECTED} rejected
          <div className="text-zinc-500">
            Registration link: <Link href={`/t/${slug}/register`} className="text-emerald-600 hover:underline">/t/{slug}/register</Link>
            {t.joinCodeEnabled && <> · code <span className="font-mono font-bold">{t.joinCode}</span></>}
          </div>
        </div>
        {t.status === "DRAFT" && <ActionForm action={setStatusAction} hidden={{ slug, status: "REGISTRATION" }} submitLabel="Open registration" inline />}
        {t.status === "REGISTRATION" && <ActionForm action={setStatusAction} hidden={{ slug, status: "LOCKED" }} submitLabel="Lock the field" inline />}
        {(t.status === "LOCKED" || t.status === "READY") && <ActionForm action={setStatusAction} hidden={{ slug, status: "REGISTRATION" }} submitLabel="Unlock (re-open registration)" variant="secondary" inline />}
      </section>

      <section className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="p-3">Team</th>
              <th className="p-3">Players</th>
              <th className="p-3">Contact</th>
              <th className="p-3">Seed</th>
              <th className="p-3">Group</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {t.teams.map((team) => (
              <tr key={team.id} className="align-top">
                <td colSpan={5} className="p-2">
                  <ActionForm action={updateTeamAction} hidden={{ slug, teamId: team.id }} submitLabel="Save" variant="ghost" inline>
                    <TeamIcon theme={t.theme} icon={team.icon} art={art} size="md" withLabel className="mb-0.5" />
                    <input name="name" defaultValue={team.name} className={`${inputCls} w-40`} />
                    <input name="members" defaultValue={team.members.join(", ")} placeholder="players" className={`${inputCls} w-48`} />
                    <input name="contact" defaultValue={team.contact ?? ""} placeholder="contact" className={`${inputCls} w-32`} />
                    <input name="seed" type="number" defaultValue={team.seed ?? ""} placeholder="seed" className={`${inputCls} w-16`} />
                    <select name="icon" defaultValue={team.icon ?? ""} className={`${inputCls} w-36`}>
                      <option value="">— no emblem —</option>
                      {findTheme(t.theme).icons.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.label}
                        </option>
                      ))}
                    </select>
                    <span className="pb-1.5 text-xs text-zinc-500">{team.group?.name ?? ""}</span>
                  </ActionForm>
                  <Link href={`/t/${slug}/team/${team.token}`} className="ml-2 text-xs text-zinc-400 hover:underline">
                    team link ↗
                  </Link>
                </td>
                <td className="p-3">
                  <StatusBadge value={team.status} />
                </td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-1">
                    {team.status !== "CONFIRMED" && (
                      <ActionForm action={teamStatusAction} hidden={{ slug, teamId: team.id, status: "CONFIRMED" }} submitLabel="Confirm" inline />
                    )}
                    {team.status !== "REJECTED" && (
                      <ActionForm action={teamStatusAction} hidden={{ slug, teamId: team.id, status: "REJECTED" }} submitLabel="Reject" variant="secondary" inline />
                    )}
                    {team.status === "REJECTED" && (
                      <ActionForm action={teamStatusAction} hidden={{ slug, teamId: team.id, status: "PENDING" }} submitLabel="Undo" variant="secondary" inline />
                    )}
                    <ActionForm action={deleteTeamAction} hidden={{ slug, teamId: team.id }} submitLabel="Delete" variant="ghost" inline />
                  </div>
                </td>
              </tr>
            ))}
            {t.teams.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-zinc-500">
                  No teams yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-2 font-semibold">Add a team by hand</h2>
        <ActionForm action={addTeamAction} hidden={{ slug }} submitLabel="Add (confirmed)" inline>
          <input name="name" required placeholder="Team name" className={`${inputCls} w-48`} />
          <input name="members" placeholder="players, comma-separated" className={`${inputCls} w-64`} />
        </ActionForm>
      </section>
    </main>
  );
}
