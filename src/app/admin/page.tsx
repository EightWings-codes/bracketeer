import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-guard";
import StatusBadge from "@/components/StatusBadge";
import LocalTime from "@/components/LocalTime";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  await requireAdmin();
  const tournaments = await prisma.tournament.findMany({
    orderBy: { startsAt: "desc" },
    include: { _count: { select: { teams: true } } },
  });
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
        <Link href="/admin/new" className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500">
          + New tournament
        </Link>
      </div>
      <ul className="space-y-3">
        {tournaments.map((t) => (
          <li key={t.id}>
            <Link
              href={`/admin/${t.slug}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white p-4 hover:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold">{t.name}</span>
                  {t.testMode && <StatusBadge value="TEST" />}
                </div>
                <div className="text-sm text-zinc-500">
                  <LocalTime iso={t.startsAt.toISOString()} withDate /> · {t._count.teams} teams · /t/{t.slug}
                </div>
              </div>
              <StatusBadge value={t.status} />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
