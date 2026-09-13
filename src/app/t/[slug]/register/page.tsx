import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import RegisterForm from "./RegisterForm";

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
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Register a team</h1>
        <p className="text-zinc-500">
          You&apos;ll get a private link for your team — keep it, it&apos;s how you see your matches and report scores.
        </p>
      </div>
      {t.status === "REGISTRATION" ? (
        <RegisterForm slug={slug} needsCode={t.joinCodeEnabled} />
      ) : (
        <p className="rounded-xl border border-zinc-200 p-6 text-center text-zinc-500 dark:border-zinc-800">
          Registration is closed.
        </p>
      )}
    </main>
  );
}
