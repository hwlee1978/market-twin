-- 0025_channel_mismatch.sql
--
-- Adds channel_mismatch_rate to the quality audit. The runner now
-- runs a country-locked-channel sanitizer that rewrites channel
-- mentions whose lock country doesn't match the persona's country
-- (e.g., a Vietnamese persona saying "Coupang", a US persona saying
-- "Rakuten"). The audit captures the per-persona rewrite count
-- as a regression signal for the country-aware persona prompt.
--
-- Nullable: legacy sims pre-dating the sanitizer don't carry a count.

alter table public.simulation_quality
  add column if not exists channel_mismatch_rate numeric;

-- Admin scan helper: high mismatch rates surface for review.
create index if not exists simulation_quality_channel_mismatch_idx
  on public.simulation_quality (channel_mismatch_rate desc, audited_at desc)
  where channel_mismatch_rate is not null and channel_mismatch_rate >= 0.3;
