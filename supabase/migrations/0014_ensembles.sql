-- Ensemble runs — group N parallel simulations of the same fixture into a
-- confidence-graded recommendation. Same input × N independent persona
-- draws → aggregate gives bestCountry distribution + segment-based picks +
-- variance metrics that single-sim can't surface.
--
-- Why a separate table (vs just nullable ensemble_id on simulations)?
--   • The ensemble has its own lifecycle (pending → running → completed)
--     that's different from any individual sim's status.
--   • The aggregate result (bestCountry distribution, per-segment recs)
--     needs to be persisted once across all N sims, not duplicated.
--   • Tier metadata (parallel_sims, llm_providers) is run-level, not
--     sim-level — keeps simulations table clean.

-- ─── ensembles ─────────────────────────────────────────────────────
create table if not exists public.ensembles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,

  -- Tier configuration. The runner spawns parallel_sims independent
  -- simulations, each with per_sim_personas — totalling
  -- parallel_sims × per_sim_personas effective personas.
  tier text not null check (tier in ('hypothesis', 'decision', 'deep')),
  parallel_sims int not null check (parallel_sims > 0 and parallel_sims <= 50),
  per_sim_personas int not null check (per_sim_personas >= 10 and per_sim_personas <= 2000),
  -- Which LLM providers participate (deep tier mixes Claude/GPT-4/Gemini/DeepSeek).
  -- Single-element array for simpler tiers.
  llm_providers text[] not null default '{anthropic}',

  -- Lifecycle
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,

  -- Aggregated output: bestCountry distribution + per-segment best country
  -- + per-country score statistics + confidence indicator. Single source of
  -- truth that the result page reads — pre-computed once when all sims
  -- complete, not on every page load.
  aggregate_result jsonb,

  -- Optional email notification when the ensemble completes (long runs go
  -- async; user doesn't need to keep the page open).
  notify_email text
);

create index if not exists ensembles_project_id_idx
  on public.ensembles (project_id, created_at desc);
create index if not exists ensembles_workspace_id_idx
  on public.ensembles (workspace_id, created_at desc);
create index if not exists ensembles_status_idx
  on public.ensembles (status) where status in ('pending', 'running');

comment on table public.ensembles is
  'Groups N parallel simulations into a single confidence-graded ensemble. Aggregate result includes bestCountry distribution and per-segment recommendations.';

-- ─── simulations: link to ensemble ─────────────────────────────────
-- Existing simulations stay unaffected (NULL ensemble_id = standalone sim).
-- New sims spawned by the ensemble runner carry both fields.
alter table public.simulations
  add column if not exists ensemble_id uuid references public.ensembles(id) on delete cascade;
alter table public.simulations
  add column if not exists ensemble_index int;

create index if not exists simulations_ensemble_id_idx
  on public.simulations (ensemble_id) where ensemble_id is not null;

comment on column public.simulations.ensemble_id is
  'When set, this sim is one of N within an ensemble. NULL = standalone sim (legacy/quick mode).';
comment on column public.simulations.ensemble_index is
  'Position within the ensemble (0..N-1). Used as the seedOverride suffix to ensure each sim draws a different persona sample.';

-- ─── RLS ─────────────────────────────────────────────────────────────
alter table public.ensembles enable row level security;

-- Workspace members read their own ensembles. Match the same pattern used
-- by the simulations table.
create policy "ensembles_select_workspace" on public.ensembles
  for select
  using (
    workspace_id in (
      select wm.workspace_id from public.workspace_members wm
      where wm.user_id = auth.uid()
    )
  );

-- Inserts go through the service role (API routes) so we don't need an
-- INSERT policy for end users — the API enforces workspace ownership.
-- Updates are runner-only (also service role).
