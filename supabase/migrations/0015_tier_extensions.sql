-- 0015_tier_extensions.sql
--
-- Two new ensemble plan tiers between the existing trio:
--   decision_plus: 15 sims × 200 personas = 3,000 effective personas
--   deep_pro:      50 sims × 200 personas = 10,000 effective personas
--
-- Both keep the same per-sim shape (200 personas, multi-LLM round-robin
-- for the 'deep_pro' variant) — the tier difference is purely sim count,
-- which is what drives ensemble consensus strength.
--
-- The check constraint is the only blocker for using these names; tier
-- is text and the rest of the schema (parallel_sims, llm_providers, etc.)
-- already accommodates any value the application picks.

alter table public.ensembles
  drop constraint if exists ensembles_tier_check;

alter table public.ensembles
  add constraint ensembles_tier_check
  check (tier in ('hypothesis', 'decision', 'decision_plus', 'deep', 'deep_pro'));
