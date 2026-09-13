// Bootstrap the first admin. Run with: node --env-file=.env scripts/seed.mjs
// Uses ADMIN_USERNAME / ADMIN_PASSWORD from the env (defaults: admin / admin123).
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const username = (process.env.ADMIN_USERNAME ?? "admin").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "admin123";

const existing = await prisma.user.findUnique({ where: { username } });
if (existing) {
  console.log(`admin "${username}" already exists — nothing to do.`);
} else {
  await prisma.user.create({
    data: { username, passwordHash: await bcrypt.hash(password, 10), isAdmin: true },
  });
  console.log(`✓ created admin "${username}"`);
}
await prisma.$disconnect();
