import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { APP } from "@/lib/config";
import StatusBadge from "@/components/StatusBadge";
import LocalTime from "@/components/LocalTime";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ test?: string }>;
}) {
  const { test } = await searchParams;
  const tournaments = await prisma.tournament.findMany({
    where: test === "1" ? {} : { testMode: false },
    orderBy: { startsAt: "desc" },
    include: { _count: { select: { teams: { where: { status: "CONFIRMED" } } } } },
  });

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tournaments</h1>
        <p className="text-zinc-500">{APP.tagline}</p>
      </div>
      {tournaments.length === 0 && (
        <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700">
          Nothing scheduled yet.
        </p>
      )}
      <ul className="space-y-3">
        {tournaments.map((t) => (
          <li key={t.id}>
            <Link
              href={`/t/${t.slug}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white p-4 hover:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold">{t.name}</span>
                  {t.testMode && <StatusBadge value="TEST" />}
                </div>
                <div className="text-sm text-zinc-500">
                  <LocalTime iso={t.startsAt.toISOString()} withDate /> · {t._count.teams} teams
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
