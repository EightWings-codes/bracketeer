import { afterAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  changePassword,
  createAdmin,
  deleteUser,
  normaliseUsername,
  passwordProblem,
  setUserAdmin,
  updateProfile,
  usernameProblem,
} from "@/lib/account";

describe("username rules", () => {
  it("lowercases and trims", () => {
    expect(normaliseUsername("  Jan.Ade \n")).toBe("jan.ade");
  });

  it("accepts letters, digits and . _ -", () => {
    expect(usernameProblem("jan.ade_2-x")).toBeNull();
  });

  it("rejects too short, too long, and stray characters", () => {
    expect(usernameProblem("jo")).toMatch(/3 characters/);
    expect(usernameProblem("j".repeat(33))).toMatch(/32 characters/);
    expect(usernameProblem("jan ade")).toMatch(/may only contain/);
    expect(usernameProblem("Jan")).toMatch(/may only contain/); // normalise first
  });
});

describe("password rules", () => {
  it("wants at least 8 characters", () => {
    expect(passwordProblem("sevench")).toMatch(/8 characters/);
    expect(passwordProblem("eightchr")).toBeNull();
  });

  it("refuses the username as password", () => {
    expect(passwordProblem("organiser", "Organiser")).toMatch(/not be the username/);
  });
});

// DB-backed. Runs only with DB_TESTS=1 and a reachable Postgres:
//   DB_TESTS=1 npx vitest run src/lib/account.test.ts
const RUN = process.env.DB_TESTS === "1";
const PREFIX = "acct-test-";

afterAll(async () => {
  if (RUN) await prisma.user.deleteMany({ where: { username: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

describe.skipIf(!RUN)("accounts (integration)", () => {
  it("changes a password only with the current one", async () => {
    const u = await createAdmin({ username: `${PREFIX}pw`, password: "first-password" });

    await expect(changePassword(u.id, "wrong", "second-password", "second-password")).rejects.toThrow(/Current password/);
    await expect(changePassword(u.id, "first-password", "second-password", "typo-password")).rejects.toThrow(/don't match/);
    await expect(changePassword(u.id, "first-password", "short", "short")).rejects.toThrow(/8 characters/);

    await changePassword(u.id, "first-password", "second-password", "second-password");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(await bcrypt.compare("second-password", after.passwordHash)).toBe(true);
  });

  it("keeps usernames unique and lowercase", async () => {
    const a = await createAdmin({ username: `${PREFIX}a`, password: "first-password" });
    await createAdmin({ username: `${PREFIX}b`, password: "first-password" });

    await expect(createAdmin({ username: `${PREFIX}A`, password: "first-password" })).rejects.toThrow(/already taken/);
    await expect(updateProfile(a.id, { name: null, username: `${PREFIX}B` })).rejects.toThrow(/already taken/);

    const renamed = await updateProfile(a.id, { name: "  Ada  ", username: `${PREFIX}Ada` });
    expect(renamed).toMatchObject({ username: `${PREFIX}ada`, name: "Ada" });
  });

  it("never lets the last admin be removed or demoted", async () => {
    const me = await createAdmin({ username: `${PREFIX}me`, password: "first-password" });
    const other = await createAdmin({ username: `${PREFIX}other`, password: "first-password" });

    await expect(deleteUser(me.id, me.id)).rejects.toThrow(/signed in with/);
    await expect(setUserAdmin(me.id, me.id, false)).rejects.toThrow(/your own admin rights/);

    // Only reachable when this pair is genuinely the last one standing.
    const realAdmins = await prisma.user.count({
      where: { isAdmin: true, username: { not: { startsWith: PREFIX } } },
    });
    if (realAdmins === 0) {
      await setUserAdmin(me.id, other.id, false);
      await expect(setUserAdmin(other.id, me.id, false)).rejects.toThrow(/last admin/);
    }
  });
});
