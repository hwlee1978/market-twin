-- 0016_sim_token_cost.sql
--
-- Per-simulation token + cost tracking. Until now we logged LLM token
-- usage per stage to console but never persisted it, so admin/billing
-- had no data to render. These three columns get populated by the
-- runner at completion (success path; failed sims keep null).
--
-- cost is in integer cents-USD so the same totalling math used for
-- product pricing (base_price_cents) carries over without dealing in
-- floating-point money.

alter table public.simulations
  add column if not exists total_input_tokens integer,
  add column if not exists total_output_tokens integer,
  add column if not exists total_cost_cents integer;

-- Workspace + month index for the per-customer billing rollup query.
create index if not exists simulations_cost_idx
  on public.simulations (workspace_id, completed_at)
  where status = 'completed' and total_cost_cents is not null;
