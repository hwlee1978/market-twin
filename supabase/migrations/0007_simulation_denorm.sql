-- Denormalize the headline metrics from simulation_results.overview onto the
-- simulations row.
--
-- Why: every time the dashboard or /reports page renders, they were joining
-- to simulation_results just to pull successScore and bestCountry out of a
-- big JSONB. The blob can be tens of KB per sim (thousands of personas), so
-- a 50-row list query was downloading a few MB it never displayed.
--
-- The simulations table already denormalizes model_provider / model_version
-- for the same reason — this just extends that pattern to the three metrics
-- the list views actually show.
--
-- Backfill is included so existing completed simulations don't show "—" in
-- the list views after deploy. The runner is updated in the same release to
-- write these columns on every new completion, so once both are live the
-- backfill becomes redundant for new rows.

alter table public.simulations
  add column if not exists success_score smallint,
  add column if not exists best_country text,
  add column if not exists recommended_price_cents integer;

-- Backfill from existing simulation_results JSONB.
-- successScore is sometimes stored as a decimal (e.g. 68.5) — cast through
-- numeric and round before going to smallint, otherwise Postgres rejects
-- "68.5" as invalid smallint syntax (22P02).
-- Cast guards against malformed rows: if a value isn't a number / string we
-- leave the column null and the UI falls back to "—".
update public.simulations s
set
  success_score = round(nullif((sr.overview->>'successScore'), '')::numeric)::smallint,
  best_country = nullif(sr.overview->>'bestCountry', ''),
  recommended_price_cents = round(nullif((sr.pricing->>'recommendedPriceCents'), '')::numeric)::integer
from public.simulation_results sr
where s.id = sr.simulation_id
  and s.status = 'completed'
  and s.success_score is null;

-- Index for /reports list queries that filter by workspace + completed and
-- order by completed_at. Existing simulations_workspace_idx covers part of
-- this; this one adds a status filter so the partial index stays small.
create index if not exists simulations_workspace_completed_idx
  on public.simulations (workspace_id, completed_at desc)
  where status = 'completed';

comment on column public.simulations.success_score is
  'Denormalized from simulation_results.overview.successScore on completion. Used by list views to avoid JSONB joins.';
comment on column public.simulations.best_country is
  'Denormalized from simulation_results.overview.bestCountry on completion.';
comment on column public.simulations.recommended_price_cents is
  'Denormalized from simulation_results.pricing.recommendedPriceCents on completion.';
