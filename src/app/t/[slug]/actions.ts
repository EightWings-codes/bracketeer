"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { DomainError, registerTeam, submitScoreReport } from "@/lib/tournament";

export interface RegisterFormState {
  error?: string;
  /** Echoed back so a failed submit doesn't wipe the form. */
  values?: { name: string; members: string; contact: string; joinCode: string };
}

export interface ScoreFormState {
  error?: string;
  ok?: boolean;
}

function errorMessage(e: unknown, fallback: string) {
  return e instanceof DomainError ? e.message : e instanceof Error ? e.message : fallback;
}

export async function registerTeamAction(
  _prev: RegisterFormState,
  formData: FormData,
): Promise<RegisterFormState> {
  const slug = String(formData.get("slug") ?? "");
  const values = {
    name: String(formData.get("name") ?? ""),
    members: String(formData.get("members") ?? ""),
    contact: String(formData.get("contact") ?? ""),
    joinCode: String(formData.get("joinCode") ?? ""),
  };
  const t = await prisma.tournament.findUnique({ where: { slug }, select: { id: true } });
  if (!t) return { error: "Tournament not found.", values };

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const members = String(formData.get("members") ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  let token: string;
  try {
    const team = await registerTeam(
      t.id,
      {
        name: String(formData.get("name") ?? ""),
        members,
        contact: String(formData.get("contact") ?? "").trim() || null,
      },
      { ip, joinCode: String(formData.get("joinCode") ?? "") },
    );
    token = team.token;
  } catch (e) {
    return { error: errorMessage(e, "Could not register."), values };
  }
  revalidatePath(`/t/${slug}`);
  redirect(`/t/${slug}/team/${token}?new=1`);
}

export async function submitScoreAction(
  _prev: ScoreFormState,
  formData: FormData,
): Promise<ScoreFormState> {
  const matchId = String(formData.get("matchId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const teamToken = String(formData.get("teamToken") ?? "") || null;
  try {
    await submitScoreReport(matchId, {
      scoreA: Number(formData.get("scoreA")),
      scoreB: Number(formData.get("scoreB")),
      reportedBy: String(formData.get("reportedBy") ?? ""),
      teamToken,
    });
  } catch (e) {
    return { error: errorMessage(e, "Could not submit the score.") };
  }
  revalidatePath(`/t/${slug}`);
  revalidatePath(`/admin/${slug}`);
  return { ok: true };
}
