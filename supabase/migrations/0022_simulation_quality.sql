-- 0022_simulation_quality.sql
--
-- Per-sim quality audit trail. Runs at the end of every successful
-- simulation, captures sanity-check results, and produces a 0-100
-- confidence_score that bubbles up to the ensemble for user display.
--
-- Stored as a separate table (vs columns on simulations) so we can:
--   1. Add new checks without altering simulations every time
--   2. Re-audit existing sims by inserting a new row + soft-replacing
--   3. Run aggregation queries for /admin/sim-quality without
--      bloating the simulations row payload
--
-- One-row-per-simulation; if a re-audit happens later we update in
-- place (audited_at advances).

create table if not exists public.simulation_quality (
  simulation_id uuid primary key references public.simulations(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,

  audited_at timestamptz not null default now(),

  -- 0-100 composite — weighted blend of the metric checks below.
  -- Surfaced verbatim on the result-page hero next to the recommendation.
  confidence_score int not null default 100,

  -- "Should we trust this sim's output at all?" Critical-level
  -- warnings (e.g. all countries scored equally, voice slip > 25%)
  -- flip this. Quarantined sims are shown to the user with a strong
  -- "interpret with care" banner; the ensemble aggregator deweights
  -- them when computing recommendation consensus.
  quarantined boolean not null default false,

  -- Per-check raw values — kept as columns (not just inside warnings
  -- jsonb) so admin queries can aggregate without parsing JSON.
  voice_slip_rate numeric,             -- 0-1
  country_score_uniformity numeric,    -- std / mean ratio; very low = suspicious
  country_score_range numeric,         -- max - min finalScore across countries
  profession_diversity numeric,        -- 0-1, 1 = perfectly even
  income_drift_pct numeric,            -- 0-1, 0 = perfect match with country_profession_income
  price_in_band boolean,               -- recommended price within ±50% of base
  synthesis_failover boolean,          -- true if synthesis fell over to backup provider

  -- Full warning list as jsonb. Each entry:
  --   { code: string, severity: "info"|"warning"|"critical",
  --     message: string, value: number, threshold: number }
  warnings jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists simulation_quality_workspace_idx
  on public.simulation_quality (workspace_id, audited_at desc);

create index if not exists simulation_quality_quarantined_idx
  on public.simulation_quality (quarantined, audited_at desc)
  where quarantined = true;

create index if not exists simulation_quality_low_confidence_idx
  on public.simulation_quality (confidence_score, audited_at desc)
  where confidence_score < 60;

-- Member SELECT only; writes via service-role from the runner.
alter table public.simulation_quality enable row level security;

drop policy if exists simulation_quality_select on public.simulation_quality;
create policy simulation_quality_select on public.simulation_quality
  for select using (public.is_workspace_member(workspace_id));
