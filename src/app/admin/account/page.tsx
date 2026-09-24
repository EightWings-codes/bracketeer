import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import { inputCls } from "@/components/ui";
import LocalTime from "@/components/LocalTime";
import { requireAdmin } from "@/lib/admin-guard";
import { listAdmins } from "@/lib/account";
import {
  changePasswordAction,
  createAdminAction,
  deleteUserAction,
  resetPasswordAction,
  setUserAdminAction,
  signOutAction,
  updateProfileAction,
} from "./actions";

export const dynamic = "force-dynamic";

const card = "space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900";

export default async function AccountPage() {
  const admin = await requireAdmin();
  const users = await listAdmins();
  const me = users.find((u) => u.id === admin.id)!;
  const others = users.filter((u) => u.id !== admin.id);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href="/admin" className="text-sm text-zinc-500 hover:underline">
            Admin
          </Link>
          <span className="text-zinc-400">/</span>
          <h1 className="text-2xl font-bold tracking-tight">Account</h1>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Sign out
          </button>
        </form>
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">Your details</h2>
        <ActionForm action={updateProfileAction} submitLabel="Save details" pendingLabel="Saving…" className={card}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="block font-medium">Username</span>
              <input
                name="username"
                defaultValue={me.username}
                autoCapitalize="none"
                autoComplete="username"
                className={`${inputCls} w-full`}
              />
              <span className="mt-1 block text-xs text-zinc-500">What you type to sign in.</span>
            </label>
            <label className="text-sm">
              <span className="block font-medium">
                Display name <span className="font-normal text-zinc-500">(optional)</span>
              </span>
              <input name="name" defaultValue={me.name ?? ""} className={`${inputCls} w-full`} />
              <span className="mt-1 block text-xs text-zinc-500">Shown instead of the username where there's room.</span>
            </label>
          </div>
        </ActionForm>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Password</h2>
        <ActionForm action={changePasswordAction} submitLabel="Change password" pendingLabel="Changing…" className={card}>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="block font-medium">Current</span>
              <input name="current" type="password" autoComplete="current-password" className={`${inputCls} w-full`} />
            </label>
            <label className="text-sm">
              <span className="block font-medium">New</span>
              <input name="next" type="password" autoComplete="new-password" className={`${inputCls} w-full`} />
            </label>
            <label className="text-sm">
              <span className="block font-medium">Repeat new</span>
              <input name="confirm" type="password" autoComplete="new-password" className={`${inputCls} w-full`} />
            </label>
          </div>
          <p className="text-xs text-zinc-500">At least 8 characters. Sessions already signed in elsewhere stay valid.</p>
        </ActionForm>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Organisers</h2>
        <p className="text-sm text-zinc-500">
          Everyone here can run every tournament. Players never need an account.
        </p>

        <ul className="space-y-2">
          <li className={`${card} flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <span className="font-medium">{me.name ?? me.username}</span>{" "}
              <span className="text-sm text-zinc-500">@{me.username} · you</span>
              <div className="text-xs text-zinc-500">
                Since <LocalTime iso={me.createdAt.toISOString()} withDate />
              </div>
            </div>
          </li>

          {others.map((u) => (
            <li key={u.id} className={`${card} space-y-3`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="font-medium">{u.name ?? u.username}</span>{" "}
                  <span className="text-sm text-zinc-500">@{u.username}</span>
                  {!u.isAdmin && <span className="ml-2 text-xs font-medium text-amber-600">suspended</span>}
                  <div className="text-xs text-zinc-500">
                    Since <LocalTime iso={u.createdAt.toISOString()} withDate />
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <ActionForm
                    action={setUserAdminAction}
                    hidden={{ userId: u.id, isAdmin: u.isAdmin ? "0" : "1" }}
                    submitLabel={u.isAdmin ? "Suspend" : "Restore access"}
                    variant="secondary"
                    inline
                  />
                  <ActionForm
                    action={deleteUserAction}
                    hidden={{ userId: u.id }}
                    submitLabel="Delete"
                    variant="danger"
                    inline
                  />
                </div>
              </div>
              <ActionForm
                action={resetPasswordAction}
                hidden={{ userId: u.id }}
                submitLabel="Set password"
                variant="secondary"
                inline
              >
                <label className="text-sm">
                  <span className="block text-xs font-medium text-zinc-500">New password for @{u.username}</span>
                  <input name="password" type="password" autoComplete="new-password" className={`${inputCls} w-56`} />
                </label>
              </ActionForm>
            </li>
          ))}
        </ul>

        <ActionForm action={createAdminAction} submitLabel="Add organiser" pendingLabel="Adding…" className={card}>
          <h3 className="text-sm font-semibold">Add an organiser</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="block font-medium">Username</span>
              <input name="username" autoCapitalize="none" className={`${inputCls} w-full`} />
            </label>
            <label className="text-sm">
              <span className="block font-medium">
                Display name <span className="font-normal text-zinc-500">(optional)</span>
              </span>
              <input name="name" className={`${inputCls} w-full`} />
            </label>
            <label className="text-sm">
              <span className="block font-medium">Password</span>
              <input name="password" type="password" autoComplete="new-password" className={`${inputCls} w-full`} />
            </label>
          </div>
        </ActionForm>
      </section>
    </main>
  );
}
