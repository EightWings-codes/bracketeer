import { redirect } from "next/navigation";
import { currentAdmin } from "@/auth";

export async function requireAdmin() {
  const admin = await currentAdmin();
  if (!admin) redirect("/signin");
  return admin;
}
