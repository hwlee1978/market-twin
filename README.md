# AI Market Twin — v0.1 MVP

B2B SaaS that simulates product launch outcomes with AI consumer personas. Predicts success probability, recommends launch country, optimizes pricing, and generates an executive PDF report.

Spec PDFs live in `docs/`.

## Stack

- **Next.js 15** (App Router, TypeScript, Tailwind) — frontend + API routes
- **Supabase** — Postgres, Auth (email + Google), Storage
- **Multi-LLM** — Anthropic Claude / OpenAI / Google Gemini, swappable per simulation stage
- **next-intl** — Korean (default) + English
- **@react-pdf/renderer** — server-side PDF report
- **Vercel** — primary deploy target (functions: `maxDuration = 300s`)

## Quick start

### 1. Install

```bash
npm install
```

### 2. Set up Supabase

1. Create a project at https://supabase.com
2. In **SQL editor**, paste and run the contents of `supabase/migrations/0001_init.sql`
3. Enable **Email** auth (Authentication → Providers). Optionally enable **Google** OAuth — set the redirect URL to `https://YOUR_DOMAIN/auth/callback` (and `http://localhost:3000/auth/callback` for local dev).

### 3. Configure env

```bash
cp .env.example .env.local
```

Fill in:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — from Supabase project settings
- At least one of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`
- `LLM_DEFAULT_PROVIDER` — `anthropic` | `openai` | `gemini`
- `LLM_DEFAULT_MODEL` — e.g. `claude-sonnet-4-6`, `gpt-4o`, `gemini-2.5-flash`

### Optional: per-stage model split (cost optimization)

Each pipeline stage can override the default model. Useful when you want a
cheap+fast model for high-volume work (persona batches) and a stronger model
only where the output really matters (executive synthesis).

```env
# Personas: cheap, runs ~5 batches per simulation
LLM_PERSONAS_PROVIDER=anthropic
LLM_PERSONAS_MODEL=claude-haiku-4-5

# Synthesis: best model — this is the headline output users see
LLM_SYNTHESIS_PROVIDER=anthropic
LLM_SYNTHESIS_MODEL=claude-sonnet-4-6
```

Stages: `personas`, `countries`, `pricing`, `synthesis`. Empty value = inherit
from `LLM_DEFAULT_*`. Resolution priority: explicit per-request > stage env >
default env > hardcoded fallback.

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000 — Korean by default. Switch to `/en` for English.

## Project layout

```
src/
  app/
    [locale]/
      (auth)/login, signup       — public auth pages
      (app)/dashboard            — KPIs + recent projects
      (app)/projects             — project list
      (app)/projects/new         — wizard (6 steps)
      (app)/projects/[id]        — project detail
      (app)/projects/[id]/results— simulation progress + tabbed dashboard
    api/
      projects                   — POST create
      simulations/[projectId]/run— POST kick off simulation
      simulations/[id]/status    — GET poll progress
      results/[simulationId]     — GET full result blob
      reports/[simulationId]/pdf — GET PDF download
    auth/callback                — OAuth/email confirmation handler
  components/
    AppShell, ProjectWizard, results/*, ui/*
  lib/
    supabase/                    — browser/server/middleware clients
    llm/                         — multi-provider abstraction
    simulation/                  — schemas, prompts, runner
    report/                      — PDF builder
    workspace.ts                 — first-login workspace bootstrap
  i18n/                          — next-intl routing + request config
  proxy.ts                       — i18n + auth guard (Next 16 proxy convention)

messages/{ko,en}.json            — translation strings
supabase/migrations/0001_init.sql— DB schema + RLS
docs/                            — original product/design spec PDFs
```

## How a simulation works

1. User completes the 6-step wizard → `POST /api/projects` creates the row.
2. Wizard immediately calls `POST /api/simulations/:projectId/run` which:
   - Inserts a `simulations` row with `status = 'pending'`
   - Returns `simulationId`
   - Kicks off `runSimulation(...)` (still inside the request — fire-and-await pattern, runs up to `maxDuration` 300s on Vercel Pro)
3. Runner pipeline: **personas → countries → pricing → synthesis**. Each stage updates `simulations.current_stage` so the UI shows progress.
4. Result blob lands in `simulation_results`. Client polls `/api/simulations/:id/status` every 3s until `completed`.
5. Results dashboard renders 6 tabs. PDF export hits `/api/reports/:simulationId/pdf?locale=ko`.

For longer-running sims (>5 min) move the runner behind a queue (Inngest/QStash/Trigger.dev) — the schema and code are already shaped for that swap.

## Deploy

- **Vercel**: link this repo, add the env vars, ensure plan is **Pro** so `maxDuration = 300` works for the simulation route.
- **Supabase**: run the migration in production project too.
- **Google OAuth**: add production callback URL in Supabase Auth settings + Google Cloud Console.

## v0.1 → v0.2 roadmap (deferred from this scaffold)

- File uploads (project assets) — Supabase Storage signed URLs
- Email/Slack notifications when simulation completes
- Stripe checkout (Starter/Growth/Enterprise tiers)
- Team invites with role-based access (admin/analyst/viewer)
- Admin console (per `docs/Ai Market Twin Admin Console Design Spec.pdf`)
- Real-time collaboration & comments

## Scripts

| | |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
