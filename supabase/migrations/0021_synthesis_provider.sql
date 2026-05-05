-- 0021_synthesis_provider.sql
--
-- Track which LLM provider actually produced the synthesis for each
-- sim. Until now, simulations.model_provider held the provider that
-- the orchestrator ASSIGNED — but with the failover wrapper, a Gemini
-- 503 spike could route the synthesis call to Anthropic, leaving the
-- aggregator's providerBreakdown reporting "gemini" when reality was
-- "anthropic".
--
-- Added as a nullable column so legacy rows render as "no failover
-- recorded" (== assigned provider was used) without a backfill.

alter table public.simulations
  add column if not exists synthesis_provider text;

-- Index for quick "how often did we fall over to anthropic last week"
-- queries from the admin/billing dashboard. Partial because most rows
-- equal model_provider and aren't interesting.
create index if not exists simulations_synthesis_provider_idx
  on public.simulations (synthesis_provider, completed_at desc)
  where synthesis_provider is not null;
