/**
 * Admin accounts: profile, password, and who else may sign in.
 *
 * Same rule as the rest of the domain layer — every mutation re-checks against
 * the DB rather than trusting the caller, and the last remaining admin can
 * neither be deleted nor demoted, so nobody can lock themselves out.
 */
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { DomainError } from "./tournament";

const BCRYPT_ROUNDS = 10;

const fail = (msg: string): never => {
  throw new DomainError(msg);
};

// ------------------------------------------------------------- validation

export function normaliseUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Returns a message, or null when the username is usable. */
export function usernameProblem(username: string): string | null {
  if (username.length < 3) return "Username needs at least 3 characters.";
  if (username.length > 32) return "Username can be at most 32 characters.";
  if (!/^[a-z0-9._-]+$/.test(username)) {
    return "Username may only contain letters, digits, dot, dash and underscore.";
  }
  return null;
}

/** Returns a message, or null when the password is acceptable. */
export function passwordProblem(password: string, username?: string): string | null {
  if (password.length < 8) return "Password needs at least 8 characters.";
  if (password.length > 200) return "Password can be at most 200 characters.";
  if (username && password.toLowerCase() === normaliseUsername(username)) {
    return "Password must not be the username.";
  }
  return null;
}

// ---------------------------------------------------------------- profile

export interface ProfileInput {
  name: string | null;
  username: string;
}

/** Change display name and/or username. Username stays unique and lowercase. */
export async function updateProfile(userId: string, input: ProfileInput) {
  const username = normaliseUsername(input.username);
  const problem = usernameProblem(username);
  if (problem) fail(problem);

  const taken = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (taken && taken.id !== userId) fail(`Username "${username}" is already taken.`);

  const name = input.name?.trim() || null;
  return prisma.user.update({
    where: { id: userId },
    data: { username, name },
    select: { id: true, username: true, name: true },
  });
}

/**
 * Change your own password. The current one has to check out, which is what
 * stops a borrowed, still-signed-in browser from taking the account over.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
) {
  const user = (await prisma.user.findUnique({ where: { id: userId } })) ?? fail("Account not found.");

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) fail("Current password is wrong.");
  if (newPassword !== confirmPassword) fail("The two new passwords don't match.");

  const problem = passwordProblem(newPassword, user.username);
  if (problem) fail(problem);
  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    fail("That's already your password.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) },
  });
}

// -------------------------------------------------------------- organisers

export async function listAdmins() {
  return prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true, name: true, isAdmin: true, createdAt: true },
  });
}

export interface NewAdminInput {
  username: string;
  name?: string | null;
  password: string;
}

/** Add another organiser. This is the only way to create a user after the seed. */
export async function createAdmin(input: NewAdminInput) {
  const username = normaliseUsername(input.username);
  const nameProblem = usernameProblem(username);
  if (nameProblem) fail(nameProblem);
  const pwProblem = passwordProblem(input.password, username);
  if (pwProblem) fail(pwProblem);

  const taken = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (taken) fail(`Username "${username}" is already taken.`);

  return prisma.user.create({
    data: {
      username,
      name: input.name?.trim() || null,
      passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
      isAdmin: true,
    },
    select: { id: true, username: true },
  });
}

/** Reset someone else's password — for the organiser who forgot theirs. */
export async function resetPassword(actorId: string, userId: string, newPassword: string) {
  if (actorId === userId) fail("Use the password form above to change your own password.");
  const user =
    (await prisma.user.findUnique({ where: { id: userId }, select: { username: true } })) ??
    fail("That account no longer exists.");

  const problem = passwordProblem(newPassword, user.username);
  if (problem) fail(problem);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) },
  });
  return user.username;
}

async function assertNotLastAdmin(userId: string) {
  const others = await prisma.user.count({ where: { isAdmin: true, id: { not: userId } } });
  if (others === 0) fail("This is the last admin — the app would have no way in.");
}

export async function setUserAdmin(actorId: string, userId: string, isAdmin: boolean) {
  if (actorId === userId) fail("You can't change your own admin rights.");
  if (!isAdmin) await assertNotLastAdmin(userId);
  await prisma.user.update({ where: { id: userId }, data: { isAdmin } });
}

export async function deleteUser(actorId: string, userId: string) {
  if (actorId === userId) fail("You can't delete the account you're signed in with.");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
  if (!user) return;
  if (user.isAdmin) await assertNotLastAdmin(userId);
  await prisma.user.delete({ where: { id: userId } });
}
