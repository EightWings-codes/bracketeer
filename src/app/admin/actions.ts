"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { createTournament, DomainError } from "@/lib/tournament";
import type { ActionState } from "@/components/ActionForm";

export async function createTournamentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const startsAt = new Date(String(formData.get("startsAt") ?? ""));
  if (Number.isNaN(startsAt.getTime())) return { error: "Pick a start date and time." };
  let slug: string;
  try {
    const t = await createTournament(
      {
        name: String(formData.get("name") ?? ""),
        slug: String(formData.get("slug") ?? ""),
        description: String(formData.get("description") ?? "").trim() || null,
        startsAt,
        gameDurationSec: Number(formData.get("gameMin") || 20) * 60,
        breakDurationSec: Number(formData.get("breakMin") || 5) * 60,
        tableCount: Number(formData.get("tableCount") || 2),
        scoreLabel: String(formData.get("scoreLabel") || "Points"),
        minTeamSize: Number(formData.get("minTeamSize") || 1),
        maxTeamSize: Number(formData.get("maxTeamSize") || 8),
        allowDraws: formData.get("allowDraws") === "on",
        manualRounds: formData.get("manualRounds") === "on",
        testMode: formData.get("testMode") === "on",
      },
      admin.id,
    );
    slug = t.slug;
  } catch (e) {
    return { error: e instanceof DomainError || e instanceof Error ? e.message : "Could not create." };
  }
  redirect(`/admin/${slug}/teams`);
}
