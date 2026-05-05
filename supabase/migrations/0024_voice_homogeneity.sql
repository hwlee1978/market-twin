-- 0024_voice_homogeneity.sql
--
-- Adds the voice-homogeneity audit column to simulation_quality. The
-- audit module measures what fraction of a sim's persona quotes have
-- a near-duplicate sibling (token-set Jaccard ≥ 0.7) — flags sims
-- where the LLM produced 30 personas that are all paraphrases of
-- "맘에 들어요" / "정말 좋아요". Surfaced as warnings + factored into
-- the composite confidence_score.
--
-- Nullable: Hypothesis-tier sims with <5 voiced personas skip the
-- check (sample too small).

alter table public.simulation_quality
  add column if not exists voice_homogeneity numeric;

-- Admin scan helper: high-homogeneity sims surface fast for review.
create index if not exists simulation_quality_voice_homog_idx
  on public.simulation_quality (voice_homogeneity desc, audited_at desc)
  where voice_homogeneity is not null and voice_homogeneity >= 0.3;
