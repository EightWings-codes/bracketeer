# Bracketeer

Plan and run a tournament live: open team registration, groups + knockout
generation, a round clock whose schedule re-derives itself when rounds run late,
per-team "what's next" pages, open score reporting with admin confirmation, a
projector board for the room, and a test mode that simulates players so the
whole thing can be rehearsed.

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

Further organisers are added in the app under **Account** (`/admin/account`),
which is also where usernames and passwords are changed — the seed script is only
for the very first admin.

## Projector board

`/board/[slug]` (admin only) is the full-screen view for a beamer in the room:
live games over the venue backdrop, group tables or the tree, and the projected
schedule — cycling, pinned or all at once. Everything it can be told is in the
query string, e.g. `?view=all&dwell=8&contrast=high`. See
`docs/projector-board.md`.

`npm run typecheck` and `npm run test` are the gates. Branding lives in
`src/lib/config.ts`.

See `DEPLOY.md` for Neon + Vercel.
