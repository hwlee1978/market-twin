-- Mr. AI — Content Briefs (Sprint 5 of Trina-pattern integration).
--
-- The 기획 (planning) stage of the Trina 4-stage content pipeline.
-- A brief is a structured plan the LLM (ContentStrategist) generates
-- from a one-line topic input + the workspace's memory/KG context.
--
-- Subsequent sprints attach:
--   Sprint 6: mrai_content_drafts (multi-format generated bodies, FK to brief)
--   Sprint 7: distribution via mrai_dispatches with new source_type
--   Sprint 8: mrai_content_metrics (GSC/GA4 rollup per brief)

create table if not exists public.mrai_content_briefs (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  created_by      uuid references auth.users(id) on delete set null,
  -- User input — minimal: just a one-line topic. Audience/formats/tone
  -- are optional refinements; strategist infers reasonable defaults
  -- from workspace memory if missing.
  topic           text not null,
  goal            text,                     -- 'seo_traffic' | 'thought_leadership' | 'lead_gen' | free-text
  target_audience text,
  formats         text[],                   -- ['blog','linkedin','threads','email']
  tone            text,                     -- 'professional' | 'conversational' | 'data_driven' | free-text
  -- Status state machine
  status          text not null default 'planning' check (status in (
    'planning',   -- LLM running strategist now
    'planned',    -- Strategy ready, no drafts yet
    'generating', -- Sprint 6 — draft generation in flight
    'ready',      -- Sprint 6 — drafts available for review
    'published',  -- Sprint 7 — distributed
    'archived'    -- user dismissed
  )),
  -- LLM-generated strategy. jsonb shape evolves; see strategist.ts.
  -- Roughly: { pillar, keywords[], hook, sections[], cta, formatRecommendations }
  strategy        jsonb,
  -- Provenance for debugging
  strategist_input_tokens   integer,
  strategist_output_tokens  integer,
  strategist_ms             integer,
  locale          text not null default 'ko' check (locale in ('ko', 'en')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists mrai_content_briefs_ws_idx
  on public.mrai_content_briefs(workspace_id, updated_at desc);
create index if not exists mrai_content_briefs_ws_status_idx
  on public.mrai_content_briefs(workspace_id, status);

alter table public.mrai_content_briefs enable row level security;

-- Drop first so re-applying the migration is idempotent (Postgres CREATE
-- POLICY doesn't support IF NOT EXISTS). Cheap because policies are
-- metadata-only, not data.
drop policy if exists "mrai_content_briefs_rw_members" on public.mrai_content_briefs;

create policy "mrai_content_briefs_rw_members" on public.mrai_content_briefs
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
