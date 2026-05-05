-- 0023_free_rerun.sql
--
-- Free rerun mechanism for low-confidence ensembles. When the quality
-- audit produces a confidence score below the threshold (env-tunable,
-- default 60), the result page offers the user a one-time re-run on
-- the house — same inputs, same tier, doesn't count against their
-- monthly quota or trial sim limit.
--
-- Caps abuse three ways:
--   1. parent_ensemble_id is uniquely indexed where set, so each
--      parent can spawn at most ONE free rerun
--   2. Re-runs themselves can never spawn another free rerun (the
--      result page hides the CTA when is_free_rerun=true)
--   3. Quota bypass is gated on is_free_rerun + parent_ensemble_id
--      both being set; either alone won't unlock the bypass

alter table public.ensembles
  add column if not exists is_free_rerun boolean not null default false,
  add column if not exists parent_ensemble_id uuid references public.ensembles(id) on delete set null;

-- One free rerun per parent. Partial unique so the column can stay
-- null on every regular ensemble.
create unique index if not exists ensembles_parent_unique
  on public.ensembles (parent_ensemble_id)
  where parent_ensemble_id is not null;

-- Index for quick "did the user already use their free rerun?" lookups.
create index if not exists ensembles_free_rerun_idx
  on public.ensembles (workspace_id, is_free_rerun, created_at desc)
  where is_free_rerun = true;
