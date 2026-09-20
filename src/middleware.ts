import { NextResponse, type NextRequest } from "next/server";

/**
 * Opening a team's private link remembers that team on the device, so the
 * public dashboard can greet them and offer a score box on their own match.
 *
 * This lives in middleware because a Server Component may not set cookies —
 * only actions and middleware can — and we want the plain act of following
 * the link to be enough, with no "remember me" button to press.
 */
const TEAM_LINK = /^\/t\/([^/]+)\/team\/([0-9a-f]{16,64})\/?$/;

export function middleware(req: NextRequest) {
  const match = TEAM_LINK.exec(req.nextUrl.pathname);
  const res = NextResponse.next();
  if (!match) return res;
  const [, slug, token] = match;
  res.cookies.set(`bt_team_${slug}`, token!, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}

export const config = { matcher: "/t/:slug/team/:token" };
