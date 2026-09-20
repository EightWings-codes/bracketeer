import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-guard";
import { publicTournamentUrl } from "@/lib/public-url";

/** The same code the control room shows, as a file to hand to a print shop. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  await requireAdmin();
  const { slug } = await params;
  const t = await prisma.tournament.findUnique({ where: { slug }, select: { slug: true } });
  if (!t) return new Response("Not found", { status: 404 });

  const svg = await QRCode.toString(await publicTournamentUrl(slug), {
    type: "svg",
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Content-Disposition": `attachment; filename="${slug}-qr.svg"`,
      "Cache-Control": "no-store",
    },
  });
}
