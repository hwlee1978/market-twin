# Staging environment setup

A second Supabase project that mirrors production, so schema changes and
payment flows can be exercised without touching customer data.

## Why a second Supabase project rather than local Postgres

30 of the 81 migrations depend on Supabase-managed schemas — `auth.users`,
`auth.uid()` inside 31 RLS policies, and `storage.objects`. A bare Postgres
container cannot host them, and shimming `auth.uid()` would make RLS behave
differently from production, which is precisely the thing staging is supposed
to verify. Supabase provides those schemas per project, so "staging database"
and "second Supabase project" are the same thing here.

## What lives where

|                   | Production                  | Staging                    |
| ----------------- | --------------------------- | -------------------------- |
| Supabase project  | `bgnomualxkqkpnjdtxsk`      | new                        |
| Data              | real customers and revenue  | test only                  |
| NICE payments     | live keys                   | **sandbox keys**           |
| App URL           | app.markettwin.ai           | Vercel preview deployment  |
| Migrations        | applied after verification  | applied first              |

The payment split is the point. NICE sandbox transactions currently write
rows into the same `subscriptions` / `nice_billing` / `sim_entitlements`
tables that will hold real revenue once payments open, and telling them apart
afterwards is nobody's idea of a good afternoon.

## Bootstrap

1. **Create the project** — Supabase dashboard → New project. Pick the same
   region as production (`ap-northeast-2`) so latency behaves comparably.

2. **Enable pgvector** — Database → Extensions → enable `vector`. Migration
   0031 issues `create extension if not exists vector`, which fails on
   projects where the extension was never made available.

3. **Grab the connection string** — Project Settings → Database → Connection
   string → URI. It contains the password; keep it out of the repo.

4. **Replay every migration**

   ```
   DATABASE_URL="postgresql://...staging..." npm run migrate:all
   ```

   Each migration runs in its own transaction and is recorded in
   `public.schema_migrations`, so a failure stops at that file and a re-run
   resumes there rather than replaying from 0001. Add `--dry-run` first to
   see the list without executing.

   The script refuses to run against a database that already holds
   workspaces. That guard is why `migrate:all` deliberately does *not* read
   `--env-file=.env.local` the way the other scripts do: `.env.local` points
   at production, and bootstrapping should never be one forgotten flag away
   from replaying 81 migrations there.

5. **Load reference data**

   ```
   DATABASE_URL="postgresql://...staging..." npx tsx scripts/sync-reference-data.ts
   ```

   24 countries of statistical reference data. Without it, simulations run
   but personas have no grounding to sit on.

6. **Point an environment at it** — in Vercel, set the Preview environment's
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, and `DATABASE_URL` to the staging project,
   plus `NEXT_PUBLIC_SITE_URL` to the preview URL. Keep Production pointed at
   production.

7. **Move the NICE sandbox keys to staging only.** Production keeps the live
   merchant credentials; staging keeps the sandbox pair.

## Ongoing use

- A new migration goes to staging first (`npm run migrate:all` picks up only
  the new file, thanks to the ledger), then to production via
  `npm run apply:migration -- <NNNN>`.
- Local development can point `.env.local` at staging instead of production.
  Today it points at production, which means `npm run dev` mutates live data.

## Limits worth knowing

- The free tier pauses a project after a week of inactivity. Waking it costs
  a slow first request, nothing more.
- Staging starts empty, so bugs that only reproduce against real customer
  data will not show up there. The transaction-wrapped dry-run against
  production (`scripts/_dryrun-0081.ts` is the worked example) remains the
  better tool for verifying SQL against the actual schema.
- Two environments means two sets of environment variables and two migration
  runs. That is the cost of the safety, and it is worth paying once money is
  moving through the system.
