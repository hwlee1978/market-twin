-- Per-LLM-call usage log. Every getLLMProvider().generate() call that
-- passes a workspaceId in usageContext writes a row here — provider,
-- model, stage, input/output tokens, cache tokens, USD cost, optional
-- context (ensembleId / simulationId / mrai conversation, etc.).
--
-- Powers the /admin/llm-usage super-admin dashboard: per-workspace
-- ranking, time-series, provider mix, stage mix.
--
-- Service-role-only access (no RLS exposure) — only the super-admin
-- page reads this via createServiceClient(), end users never hit it
-- directly. Keeps token / cost detail out of every workspace's
-- own RLS scope.

create table if not exists public.llm_usage_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null, -- 'anthropic' | 'openai' | 'gemini' | 'xai' | 'deepseek'
  model text not null,
  stage text not null,    -- 'personas' | 'synthesis' | 'market-profile' | 'mrai-chat' | etc.
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_creation_input_tokens integer,
  cache_read_input_tokens integer,
  cost_usd numeric(10, 6) not null default 0,
  context jsonb,          -- ensemble_id / simulation_id / mrai_conversation_id / etc.
  created_at timestamptz not null default now()
);

-- Indexes for the four super-admin views: ranking (workspace agg),
-- time-series (workspace + day), provider mix (provider agg), stage
-- mix (stage agg). All four use workspace_id + created_at, so a
-- composite index serves them. Provider/stage drilldowns are small
-- enough not to need their own index.
create index if not exists llm_usage_log_workspace_created_idx
  on public.llm_usage_log (workspace_id, created_at desc);

create index if not exists llm_usage_log_created_idx
  on public.llm_usage_log (created_at desc);

-- RLS enabled but no policies — only service_role bypass works.
-- Super-admin dashboard uses createServiceClient(); regular users
-- never see this table.
alter table public.llm_usage_log enable row level security;
