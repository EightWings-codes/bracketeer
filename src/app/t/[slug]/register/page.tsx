import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import RegisterForm from "./RegisterForm";
import { describeSize, isSolo, unitLower } from "@/lib/roster";

export const dynamic = "force-dynamic";

export default async function RegisterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await prisma.tournament.findUnique({ where: { slug } });
  if (!t) notFound();

  return (
    <main className="mx-auto max-w-md space-y-6 p-6">
      <div>
        <Link href={`/t/${slug}`} className="text-sm text-zinc-500 hover:underline">
          ← {t.name}
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          {isSolo(t) ? "Enter the tournament" : "Register a team"}
        </h1>
        <p className="text-zinc-500">
          This device will remember you, so the dashboard shows your matches and lets you report scores. You also get a
          private link for a second device.
        </p>
        {!isSolo(t) && <p className="mt-1 text-sm text-zinc-500">Teams of {describeSize(t)}.</p>}
      </div>
      {t.status === "REGISTRATION" ? (
        <RegisterForm
          slug={slug}
          needsCode={t.joinCodeEnabled}
          solo={isSolo(t)}
          sizeHint={describeSize(t)}
          minMembers={t.minTeamSize}
        />
      ) : (
        <p className="rounded-xl border border-zinc-200 p-6 text-center text-zinc-500 dark:border-zinc-800">
          Registration is closed.
        </p>
      )}
    </main>
  );
}
