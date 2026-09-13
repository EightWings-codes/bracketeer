import Link from "next/link";
import { auth, signOut } from "@/auth";
import { APP } from "@/lib/config";

export default async function Header() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 p-4">
        <Link href="/" className="font-bold tracking-tight">
          {APP.emoji} {APP.name}
        </Link>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <Link href="/" className="hover:text-emerald-600">
            Tournaments
          </Link>
          {user?.isAdmin ? (
            <>
              <Link href="/admin" className="hover:text-emerald-600">
                Admin
              </Link>
              <span className="text-zinc-500">{user.username}</span>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button
                  type="submit"
                  className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/signin"
              className="rounded-lg border border-zinc-300 px-3 py-1.5 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Admin sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
