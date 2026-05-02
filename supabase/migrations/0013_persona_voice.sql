-- Add `voice` (first-person quote) to per-simulation persona reactions.
--
-- Why: a list of trustFactors / objections reads like a checklist. A short
-- 1-sentence quote in the persona's own voice ("$25는 비싸지만 Reddit 후기가
-- 많아 한 번 사볼만함 — 단 정품 인증 안 보이면 패스") does the same job in
-- a way that feels human. Stakeholders and demo viewers grasp persona
-- realism much faster from a quote than from bullets.
--
-- Voice is product-specific (the same 30-year-old Tokyo nail artist will
-- say different things about K-beauty serum vs SaaS dashboard), so it lives
-- in `simulation_persona_reactions` next to the other reaction fields, not
-- in the workspace persona pool's base profile.

alter table public.simulation_persona_reactions
  add column if not exists voice text not null default '';

comment on column public.simulation_persona_reactions.voice is
  'First-person 1-2 sentence quote capturing this persona''s reaction to the product. Surfaces in PersonasTab as an italic blockquote on the persona card.';
