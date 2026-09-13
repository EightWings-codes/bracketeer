# Deploying Bracketeer (Neon + Vercel)

**Live:** https://bracketeer.vercel.app — Vercel project `lichterloh/bracketeer`, connected to
`EightWings-codes/bracketeer` (pushes to `main` deploy). Database: a separate `bracketeer`
database inside the existing Neon project that also hosts beerpong-elo (same host, own DB).
The steps below document how it was set up and how to redo it from scratch.

Steps that need your login are marked **[you]**. Everything else is already done in the repo.

## 1. Neon database **[you]**

- neon.tech → New project → name it `bracketeer`, region close to you.
- Copy **both** connection strings from the dashboard:
  - the *pooled* one (contains `-pooler`) → `DATABASE_URL`
  - the *direct* one → `DATABASE_URL_UNPOOLED`

No manual schema step: the Vercel build runs `prisma db push`, so the schema is
created/synced on every deploy.

## 2. Vercel project **[you]**

- vercel.com → **Add New… → Project** → import `EightWings-codes/bracketeer`.
- Framework: Next.js (auto-detected). Leave build settings default
  (`npm run build` = `prisma generate && prisma db push --skip-generate && next build`).
- Before deploying, add the environment variables below.

## 3. Environment variables (Vercel → Settings → Environment Variables)

| Name | Value |
|------|-------|
| `DATABASE_URL` | Neon pooled connection string |
| `DATABASE_URL_UNPOOLED` | Neon direct connection string |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | `https://<your-app>.vercel.app` (set after the first deploy, then redeploy) |
| `AUTH_TRUST_HOST` | `true` |

## 4. First admin **[you, once]**

There is no public sign-up. After the first successful deploy, create the admin
from your machine against the production DB:

```bash
DATABASE_URL="<neon direct url>" DATABASE_URL_UNPOOLED="<neon direct url>" \
ADMIN_USERNAME=admin ADMIN_PASSWORD='<strong password>' \
node scripts/seed.mjs
```

(The script is idempotent — it does nothing if the username exists.)

## 5. Deploy & check

- Deploy, copy the `*.vercel.app` URL, set `AUTH_URL`, redeploy.
- Sign in at `/signin` → `/admin/new` → create a **test-mode** tournament first and
  rehearse with the Test mode tab before the real event.

## Renaming / branding

Everything user-visible lives in `src/lib/config.ts`.

## Notes

- Dashboards poll every 5 s (`APP.pollIntervalMs`); a 30-person crowd is a few
  hundred function invocations a minute, well inside the Hobby tier.
- Test-mode tournaments never show on the public list (`/?test=1` reveals them).
