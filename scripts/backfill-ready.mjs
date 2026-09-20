// One-off after the READY state was introduced.
//
// Starting a round now requires a confirmed schedule. Tournaments that were
// already LOCKED *with a generated plan* pre-date that button, so they would
// be stranded — they are treated as confirmed. A LOCKED tournament with no
// rounds yet is genuinely still being planned and is left alone.
//
//   node --env-file=.env scripts/backfill-ready.mjs [--apply]
//
// Without --apply it only reports what it would change.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

const stranded = await prisma.tournament.findMany({
  where: { status: "LOCKED", slots: { some: {} } },
  select: { id: true, slug: true, name: true, _count: { select: { slots: true } } },
});

if (stranded.length === 0) {
  console.log("Nothing to backfill — no LOCKED tournament has a plan.");
} else {
  for (const t of stranded) console.log(`${apply ? "→" : "would set"} READY: ${t.slug} (${t._count.slots} rounds)`);
  if (apply) {
    const { count } = await prisma.tournament.updateMany({
      where: { id: { in: stranded.map((t) => t.id) } },
      data: { status: "READY" },
    });
    console.log(`\n✓ ${count} tournament(s) marked READY`);
  } else {
    console.log("\nRe-run with --apply to write.");
  }
}
await prisma.$disconnect();
