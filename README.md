# AI Market Twin — v0.1 MVP

B2B SaaS that simulates K-product overseas launch outcomes with AI consumer personas. Predicts success probability, recommends launch country, optimizes pricing, surfaces 1인칭 customer voice, and generates an executive PDF report — typically in 5–7 minutes per simulation.

Spec PDFs live in `docs/`.

## Stack

- **Next.js 16** (App Router, Turbopack, TypeScript, Tailwind 4) — frontend + API routes
- **Supabase** — Postgres (with RLS), Auth (email + Google), Storage
- **Multi-LLM** — Anthropic Claude / OpenAI / Google Gemini, swappable per simulation stage; vision support via Anthropic for asset analysis
- **next-intl** — Korean (default) + English
- **@react-pdf/renderer** — server-side multi-locale PDF report
- **Vercel** — primary deploy target (functions: `maxDuration = 300s`, lifecycle via `after()` from `next/server`)

## Quick start

### 1. Install

```bash
npm install
```

### 2. Set up Supabase

1. Create a project at https://supabase.com
2. In **SQL editor**, paste and run each migration in `supabase/migrations/` in numeric order (`0001` through `0013`). Or use `npm run apply:migration -- 0013` to apply by prefix once `DATABASE_URL` is set.
3. Apply reference data seeds: `DATABASE_URL=postgres://... npm run sync:reference` (idempotent — safe to re-run).
4. Enable **Email** auth (Authentication → Providers). Optionally enable **Google** OAuth — set the redirect URL to `https://YOUR_DOMAIN/auth/callback` (and `http://localhost:3000/auth/callback` for local dev).

### 3. Configure env

```bash
cp .env.example .env.local
```

Required:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — from Supabase project settings
- At least one of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`
- `LLM_DEFAULT_PROVIDER` — `anthropic` | `openai` | `gemini`
- `LLM_DEFAULT_MODEL` — e.g. `claude-sonnet-4-6`, `gpt-4o`, `gemini-2.5-flash`
- `DATABASE_URL` — Supabase **Shared Pooler** connection string (used by scripts/, not the runtime app)

### Optional: per-stage model split (cost optimization)

Each pipeline stage (`personas`, `countries`, `pricing`, `synthesis`) can override the default model via env vars. Useful when you want a cheap+fast model for high-volume work and a stronger model only where the output matters.

**Voice-safe recommended config** (≈10–15% cost reduction, voice quality preserved):

```env
LLM_COUNTRIES_PROVIDER=anthropic
LLM_COUNTRIES_MODEL=claude-haiku-4-5-20251001
LLM_PRICING_PROVIDER=anthropic
LLM_PRICING_MODEL=claude-haiku-4-5-20251001
# Personas + Synthesis stay on Sonnet — voice quality is a key differentiator
```

**Do not** override `LLM_PERSONAS_MODEL` to Haiku without verifying voice quality with `npm run compare:voice` — Haiku tends to flatten 1인칭 nuance and ignores the EN length cap. Resolution priority: explicit per-request > stage env > default env > hardcoded fallback.

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000 — Korean by default. Switch to `/en` for English. The empty-state dashboard shows a one-click **Demo** button that runs a 50-persona K-earbuds simulation in ~3 minutes — useful as a first walkthrough before filling the wizard.

## Project layout

```
src/
  app/
    [locale]/
      (auth)/login, signup       — public auth pages
      (app)/dashboard            — KPIs + recent projects + demo CTA
      (app)/projects             — project list
      (app)/projects/new         — 6-step wizard (product → pricing → countries → competitors → assets → review)
      (app)/projects/[id]        — project detail + first-sim CTA
      (app)/projects/[id]/results— simulation progress + tabbed dashboard + PDF export + retry
      (app)/projects/[id]/compare— A/B side-by-side dashboard for two simulations
      admin/                     — admin console (workspaces, simulations, models, audit log)
    api/
      projects                   — POST create
      projects/demo              — POST one-click demo project + simulation
      simulations/[id]/run       — POST kick off simulation
      simulations/[id]/status    — GET poll progress
      simulations/[id]/cancel    — POST user-facing cancellation
      simulations/[id]/retry     — POST user-facing retry of a failed sim
      admin/simulations/[id]/retry — POST admin retry (any workspace)
      results/[simulationId]     — GET full result blob
      reports/[simulationId]/pdf — GET PDF download
    auth/callback                — OAuth/email confirmation handler
  components/
    AppShell, ProjectWizard, results/*, onboarding/*, admin/*, ui/*
  lib/
    supabase/                    — browser/server/middleware clients
    llm/                         — multi-provider abstraction (anthropic/openai/gemini), per-stage routing
    simulation/                  — schemas, prompts, runner, profession-pool, locale-filter, regulatory, aggregate
    reference/                   — country reference data loader (income / consumer norms)
    report/                      — multi-locale PDF builder
    workspace.ts                 — first-login workspace bootstrap
    email/                       — Resend notify-on-completion
    analytics/                   — PostHog wrapper
  i18n/                          — next-intl routing + request config
  proxy.ts                       — i18n + auth guard (Next 16 proxy convention)

messages/{ko,en}.json            — translation strings
supabase/migrations/             — DB schema + RLS, 0001 → 0013
supabase/seeds/                  — reference data per country (KOSIS, BLS, e-Stat, etc.)
docs/                            — original product/design spec PDFs
scripts/                         — operator scripts (see Scripts section)
```

## How a simulation works

A wizard submission triggers `POST /api/simulations/:id/run`, which inserts a `simulations` row with `status = 'pending'` and schedules `runSimulation(...)` via `after()` from `next/server` — so the HTTP response returns immediately and the runner gets the full `maxDuration` (300s) budget on Vercel without holding the request open.

The runner advances through 6 stages (each one bumps `simulations.current_stage` so the UI poll shows progress):

| Stage | What happens |
|---|---|
| `validating` | Loads project, resolves workspace, plans persona slots via category-specific archetype pools |
| `regulatory` | LLM checks for category bans / labeling rules per candidate country (synthesis-tier model) |
| `personas` | **Pool sampling** for slots already in the workspace pool (reaction-only LLM call) + **fresh generation** for misses (full persona LLM call). Fresh base profiles get saved back to the pool. Each persona carries a 1인칭 voice quote. |
| `scoring` | Country ranking from aggregated persona stats (intent histograms, top objections / trust factors, profession mix) — small structured LLM call |
| `pricing` | 3× parallel multi-sample pricing runs, median-selected for stability |
| `recommend` | Synthesis stage: vision-aware (uploaded asset images flow through Anthropic vision), produces overview + recommendations + risks. Followed by a **self-critique** pass that catches macro inconsistencies (best-country mismatch, etc.) before persisting. |

The result blob lands in `simulation_results`. Client polls `/api/simulations/:id/status` every 3s; `ResultsView` swaps between `SimulationProgress`, `FailedState` (with retry button), `CancelledState`, and the 6-tab `ResultsDashboard` based on status. PDF export hits `/api/reports/:simulationId/pdf?locale=ko`.

For longer-running sims (>5 min) move the runner behind a queue (Inngest/QStash/Trigger.dev) — the schema and code are already shaped for that swap.

### Persona pool (workspace-private reuse layer)

Each workspace builds a private pool of base persona profiles. The runner samples from the pool first and only generates fresh personas for slots the pool can't satisfy. Reaction-only generation (the LLM produces just `{trustFactors, objections, purchaseIntent, voice}` for known personas) cuts ~50% of tokens vs full persona generation. As a workspace runs more sims, hit rate climbs and per-sim cost drops. Pre-seed a workspace's pool with `npm run seed:pool` (see Scripts).

### Voice (1인칭 customer quotes)

Every persona carries a `voice` field — a 1–2 sentence first-person quote that reads like an actual interview clip rather than a checklist row. Three layered defenses keep voice quality:

1. **Prompt layer 1 (system)** — `PERSONA_SYSTEM` and `PERSONA_REACTION_SYSTEM` enumerate slip patterns and counter-examples.
2. **Prompt layer 2 (final self-check)** — both prompts append a per-emit script-validation checklist for the locale.
3. **Runtime sanitizer** — `sanitizeVoice(voice, locale)` in `runner.ts` rejects slipped voices (pure non-locale or mixed strings like `成分表 확인 못 해요`), logs the drop with persona country + offending text, and replaces with empty string. UI hides empty voice bubbles, so a slipped persona just loses its quote.

End of personas stage logs a summary: `[sim X] voice slips: 0/50 (locale=ko) ✓`.

### Cancellation

`POST /api/simulations/:id/cancel` marks the row cancelled. The runner checks the cancel flag at every stage boundary and exits cleanly with a `CANCELLED_ERR` sentinel that the route handler catches without flagging as an error.

## Deploy

- **Vercel**: link this repo, add the env vars, ensure plan is **Pro** so `maxDuration = 300` works for the simulation route.
- **Supabase**: run all migrations + reference seeds in production project too.
- **Google OAuth**: add production callback URL in Supabase Auth settings + Google Cloud Console.

## Reference data refresh

Each country's persona income / consumer-norms reference data lives in `supabase/seeds/000X_<code>_reference_data.sql` (24 countries + 3 cross-cutting bundles as of 2026-05-01). To keep these in sync with the underlying public statistics:

- **Apply seeds to a DB** (idempotent — safe to re-run):
  ```
  DATABASE_URL=postgres://... npm run sync:reference
  DATABASE_URL=postgres://... npm run sync:reference kr us de  # subset
  ```
  Get `DATABASE_URL` from Supabase → Project Settings → Database → Connection string (use the **Shared Pooler** for IPv4-only environments).
- **Run fetchers to refresh seed contents**:
  ```
  KOSIS_API_KEY=... BLS_API_KEY=... npm run fetch:reference
  ```
  Each fetcher writes its updated SQL back to `supabase/seeds/`. Review the diff before applying.
- **GitHub Actions** runs the same flow annually (`.github/workflows/refresh-reference-data.yml`). Required repo secrets: `SUPABASE_DATABASE_URL` plus optional API keys per fetcher (`KOSIS_API_KEY`, `BLS_API_KEY`, ...).

To add a new country fetcher, drop a `CountryFetcher` implementation under `scripts/fetch-reference/fetchers/<code>.ts` and register it in `scripts/fetch-reference/index.ts`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run e2e` / `e2e:ui` / `e2e:headed` | Playwright tests |
| `npm run sync:reference [codes...]` | Apply reference data seeds to the DB |
| `npm run fetch:reference [codes...]` | Run country fetchers, update seeds |
| `npm run apply:migration -- <prefix>` | One-shot migration applier (e.g. `0013`) |
| `npm run seed:pool -- <workspace_id> <category> [countries] [per-country]` | Pre-fill a workspace's persona pool for cold-start mitigation |
| `npm run inventory:pool` | DB read-only: workspace pool sizes + top (base_profession × country) cells |
| `npm run validate:categories` | Smoke test: 7 non-beauty categories × 8 KO personas in parallel; reports parse rate, slot adherence, voice cap violations, language slips, translated-brand patterns |
| `npm run compare:voice` | Sonnet vs Haiku side-by-side on the same persona prompt for voice quality comparison |

## v0.1 → v0.2 roadmap (deferred)

- Email/Slack notifications when simulation completes (basic Resend wired; Slack pending)
- Stripe checkout (Starter/Growth/Enterprise tiers) — `workspaces.plan` column exists but no enforcement
- Team invites with role-based access (admin/analyst/viewer)
- Real-time collaboration & comments
- Public report sharing links (signed URLs)
- Persona pool Phase 2: opt-in shared pool across workspaces, eviction policy, atomic `use_count` RPC
