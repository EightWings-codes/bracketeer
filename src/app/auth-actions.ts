"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export interface AuthFormState {
  error?: string;
}

export async function signInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    await signIn("credentials", { username, password, redirectTo: "/admin" });
  } catch (e) {
    if (e instanceof AuthError) return { error: "Invalid username or password." };
    throw e; // re-throw the redirect
  }
  return {};
}
