import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import TestPanel from "./TestPanel";

export default async function TestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await prisma.tournament.findUnique({ where: { slug }, select: { testMode: true, status: true, gameDurationSec: true } });
  if (!t) notFound();
  if (!t.testMode) {
    return <p className="text-zinc-500">This tournament is not in test mode. Test mode can only be enabled while it is a draft.</p>;
  }
  return (
    <main className="space-y-4">
      <p className="text-sm text-zinc-500">
        The simulator plays the crowd: it registers teams, reports scores (sometimes conflicting), and with auto-clock presses
        start/stop when the projected time arrives. To rehearse at speed, set the game duration to 0.5 min in Settings
        (currently {t.gameDurationSec / 60} min).
      </p>
      <TestPanel slug={slug} status={t.status} />
    </main>
  );
}
