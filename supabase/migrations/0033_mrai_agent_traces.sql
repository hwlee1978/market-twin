-- Mr. AI — 3-Layer Agent traces (Sprint 1 of Trina-inspired upgrade).
--
-- One row per orchestrator run. Captures each layer's input/output so
-- we can:
--   1. Debug — see which layer produced bad output when a chat goes weird
--   2. Cost-attribute per layer (tokens × model price)
--   3. Feed KPI Loop later (Sprint 3) — "L3 outputs the user dismissed"
--      become training data for next L1 plan.
--
-- Keeping all 3 layers in one row (not separate rows per layer) because
-- they're always written together at the end of a turn. JSONB lets us
-- store variable-shape evidence packs without schema lock-in.

create table if not exists public.mrai_agent_traces (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid references public.mrai_conversations(id) on delete cascade,
  user_message_id uuid references public.mrai_messages(id) on delete set null,
  asst_message_id uuid references public.mrai_messages(id) on delete set null,
  -- Whether the orchestrator ran full 3-layer or short-circuited to single-LLM
  mode            text not null check (mode in ('full', 'simple')),
  -- L1 Strategist output (the plan)
  l1_plan         jsonb,
  l1_input_tokens integer,
  l1_output_tokens integer,
  l1_ms           integer,
  -- L2 Analyst output (evidence pack — memories ids + signal ids + notes)
  l2_evidence     jsonb,
  l2_ms           integer,
  -- L3 Synthesizer (final user-facing text)
  l3_text         text,
  l3_input_tokens integer,
  l3_output_tokens integer,
  l3_ms           integer,
  -- Total wall-clock including network + DB
  total_ms        integer,
  created_at      timestamptz not null default now()
);

create index if not exists mrai_agent_traces_ws_idx
  on public.mrai_agent_traces(workspace_id, created_at desc);
create index if not exists mrai_agent_traces_msg_idx
  on public.mrai_agent_traces(asst_message_id);

alter table public.mrai_agent_traces enable row level security;

create policy "mrai_trace_rw_members" on public.mrai_agent_traces
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
