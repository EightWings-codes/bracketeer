// Create (or re-password) admin accounts. There is no public sign-up, so this
// is the only way an organiser gets an account.
//
//   node --env-file=.env scripts/seed-admins.mjs jan türmlibar jonas admin
//   node --env-file=.env scripts/seed-admins.mjs --reset jan
//
// Against production, pass the Neon *direct* URL instead of an env file:
//   DATABASE_URL="<neon direct url>" DATABASE_URL_UNPOOLED="<neon direct url>" \
//     node scripts/seed-admins.mjs jan türmlibar jonas admin
//
// Existing users are left alone unless --reset is given. The password is read
// from ADMIN_PASSWORD, or prompted for (hidden) so it stays out of shell
// history. Usernames are lowercased to match what the sign-in form does.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createInterface } from "node:readline";

const args = process.argv.slice(2);
const reset = args.includes("--reset");
const usernames = args
  .filter((a) => !a.startsWith("--"))
  .map((a) => a.trim().toLowerCase())
  .filter(Boolean);

if (usernames.length === 0) {
  console.error("usage: seed-admins.mjs [--reset] <username> [username...]");
  process.exit(1);
}

async function askPassword() {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // Swallow the echo so the password is not written to the terminal.
  const onData = () => rl.output.write("[2K[200D Password: ");
  rl.input.on("data", onData);
  const answer = await new Promise((resolve) => rl.question(" Password: ", resolve));
  rl.input.off("data", onData);
  rl.close();
  process.stdout.write("\n");
  return answer;
}

const password = process.env.ADMIN_PASSWORD ?? (await askPassword());
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const prisma = new PrismaClient();
const passwordHash = await bcrypt.hash(password, 10);

for (const username of usernames) {
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing && !reset) {
    console.log(`· "${username}" already exists — left alone (use --reset to set a new password)`);
    continue;
  }
  if (existing) {
    await prisma.user.update({ where: { username }, data: { passwordHash, isAdmin: true } });
    console.log(`↻ reset password for "${username}"`);
  } else {
    const name = username.charAt(0).toUpperCase() + username.slice(1);
    await prisma.user.create({ data: { username, passwordHash, name, isAdmin: true } });
    console.log(`✓ created admin "${username}"`);
  }
}

const all = await prisma.user.findMany({ select: { username: true, isAdmin: true }, orderBy: { username: "asc" } });
console.log(`\nadmins now: ${all.filter((u) => u.isAdmin).map((u) => u.username).join(", ")}`);
await prisma.$disconnect();
