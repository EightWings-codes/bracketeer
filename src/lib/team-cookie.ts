/**
 * Remembering a team on a device. Registration hands out a private token; we
 * park it in a cookie so the player never has to find their link again — the
 * dashboard recognises them and offers a score box on their own match.
 *
 * Scoped per tournament, so one phone can be a different team in each event.
 * The cookie is httpOnly: the token is a credential, not something page
 * scripts should be able to read.
 */
import { cookies } from "next/headers";
import { prisma } from "./prisma";

const YEAR = 60 * 60 * 24 * 365;

const key = (slug: string) => `bt_team_${slug}`;

export async function rememberTeam(slug: string, token: string) {
  (await cookies()).set(key(slug), token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: YEAR,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function forgetTeam(slug: string) {
  (await cookies()).delete(key(slug));
}

export async function readTeamToken(slug: string): Promise<string | null> {
  return (await cookies()).get(key(slug))?.value ?? null;
}

/**
 * The remembered team, re-checked against the DB: a cookie from a deleted
 * team, or one belonging to another tournament, counts as nobody.
 */
export async function rememberedTeam(slug: string, tournamentId: string) {
  const token = await readTeamToken(slug);
  if (!token) return null;
  const team = await prisma.team.findUnique({
    where: { token },
    select: { id: true, name: true, token: true, status: true, tournamentId: true },
  });
  if (!team || team.tournamentId !== tournamentId) return null;
  return team;
}
