import { headers } from "next/headers";

/**
 * The origin players end up on. A QR code is scanned by a phone that is not on
 * this machine, so "whatever host the admin is browsing" is only the fallback:
 *
 *   PUBLIC_BASE_URL                 set it locally to print production codes
 *   VERCEL_PROJECT_PRODUCTION_URL   so a preview deploy still prints the real domain
 *   request host                    local dev
 */
export async function publicBaseUrl() {
  const explicit = process.env.PUBLIC_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return `https://${production}`;

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Public dashboard URL for a tournament — what the QR code encodes. */
export async function publicTournamentUrl(slug: string) {
  return `${await publicBaseUrl()}/t/${slug}`;
}
