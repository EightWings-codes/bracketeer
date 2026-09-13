import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        const username = String(creds?.username ?? "")
          .trim()
          .toLowerCase();
        const password = String(creds?.password ?? "");
        if (!username || !password) return null;

        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return { id: user.id, name: user.name ?? user.username };
      },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        const u = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { username: true, name: true, isAdmin: true },
        });
        session.user.username = u?.username ?? "";
        session.user.name = u?.name ?? u?.username ?? null;
        session.user.isAdmin = u?.isAdmin ?? false;
      }
      return session;
    },
  },
});

/** Server-side guard for admin pages/actions. Returns the session user or null. */
export async function currentAdmin() {
  const session = await auth();
  const u = session?.user;
  if (!u?.id) return null;
  // Re-check against the DB rather than trusting the JWT alone.
  const db = await prisma.user.findUnique({
    where: { id: u.id },
    select: { id: true, isAdmin: true, username: true },
  });
  if (!db?.isAdmin) return null;
  return db;
}
