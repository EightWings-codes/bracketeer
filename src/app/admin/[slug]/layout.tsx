import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-guard";
import StatusBadge from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

const TABS = [
  ["", "Control room"],
  ["/teams", "Teams"],
  ["/format", "Format"],
  ["/schedule", "Schedule"],
  ["/settings", "Settings"],
] as const;

export default async function AdminTournamentLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  await requireAdmin();
  const { slug } = await params;
  const t = await prisma.tournament.findUnique({ where: { slug }, select: { name: true, status: true, testMode: true } });
  if (!t) notFound();
  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href="/admin" className="text-sm text-zinc-500 hover:underline">
            Admin
          </Link>
          <span className="text-zinc-400">/</span>
          <h1 className="text-2xl font-bold tracking-tight">{t.name}</h1>
          <StatusBadge value={t.status} />
          {t.testMode && <StatusBadge value="TEST" />}
        </div>
        <Link href={`/t/${slug}`} className="text-sm text-emerald-600 hover:underline" target="_blank">
          Public dashboard ↗
        </Link>
      </div>
      <nav className="mb-6 flex flex-wrap gap-1 border-b border-zinc-200 text-sm dark:border-zinc-800">
        {TABS.map(([href, label]) => (
          <Link key={href} href={`/admin/${slug}${href}`} className="rounded-t-lg px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            {label}
          </Link>
        ))}
        {t.testMode && (
          <Link href={`/admin/${slug}/test`} className="rounded-t-lg px-3 py-2 text-fuchsia-600 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            Test mode
          </Link>
        )}
      </nav>
      {children}
    </div>
  );
}
