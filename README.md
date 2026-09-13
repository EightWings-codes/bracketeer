# Bracketeer

Plan and run a tournament live: open team registration, groups + knockout
generation, a round clock whose schedule re-derives itself when rounds run late,
per-team "what's next" pages, open score reporting with admin confirmation, and a
test mode that simulates players so the whole thing can be rehearsed.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 · Prisma 6 +
Postgres (Neon in prod) · Auth.js v5 (admins only) · Vitest.

## Local dev

```bash
cp .env.example .env         # fill in DATABASE_URL, AUTH_SECRET
npm install
npx prisma db push
npm run db:seed              # creates the first admin (ADMIN_USERNAME / ADMIN_PASSWORD)
npm run dev
```

`npm run typecheck` and `npm run test` are the gates. Branding lives in
`src/lib/config.ts`.

See `DEPLOY.md` for Neon + Vercel.
