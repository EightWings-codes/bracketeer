"use server";

import { revalidatePath } from "next/cache";
import { signOut } from "@/auth";
import { requireAdmin } from "@/lib/admin-guard";
import {
  changePassword,
  createAdmin,
  deleteUser,
  resetPassword,
  setUserAdmin,
  updateProfile,
} from "@/lib/account";
import { DomainError } from "@/lib/tournament";
import type { ActionState } from "@/components/ActionForm";

const s = (fd: FormData, key: string) => String(fd.get(key) ?? "");

/** Domain errors are messages for the user; anything else is a real bug. */
async function run(fn: () => Promise<string>): Promise<ActionState> {
  try {
    const ok = await fn();
    revalidatePath("/admin/account");
    return { ok };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

export async function updateProfileAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  return run(async () => {
    const user = await updateProfile(me.id, { name: s(fd, "name"), username: s(fd, "username") });
    return `Saved — you now sign in as "${user.username}".`;
  });
}

export async function changePasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  return run(async () => {
    await changePassword(me.id, s(fd, "current"), s(fd, "next"), s(fd, "confirm"));
    return "Password changed. Use the new one next time you sign in.";
  });
}

export async function createAdminAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  return run(async () => {
    const user = await createAdmin({
      username: s(fd, "username"),
      name: s(fd, "name"),
      password: s(fd, "password"),
    });
    return `Added organiser "${user.username}".`;
  });
}

export async function resetPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  return run(async () => {
    const username = await resetPassword(me.id, s(fd, "userId"), s(fd, "password"));
    return `New password set for "${username}" — pass it on and let them change it.`;
  });
}

export async function setUserAdminAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  return run(async () => {
    const isAdmin = s(fd, "isAdmin") === "1";
    await setUserAdmin(me.id, s(fd, "userId"), isAdmin);
    return isAdmin ? "Access restored." : "Access suspended.";
  });
}

export async function deleteUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  return run(async () => {
    await deleteUser(me.id, s(fd, "userId"));
    return "Account deleted.";
  });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/signin" });
}
