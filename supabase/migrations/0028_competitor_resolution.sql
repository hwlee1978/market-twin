-- Competitor resolution: store user-named competitors and LLM-discovered
-- additions with attribution. Wizard previously asked for URLs only,
-- which was high-friction — most users don't have CDN-hosted competitor
-- pages bookmarked. Now they type names; an LLM resolution pass finds
-- URLs and adds 2-3 more competitors the user didn't mention. UI splits
-- "your input" vs "AI-discovered" so attribution stays honest.

-- New JSONB column captures the full structure post-resolution. Each
-- entry: { name, url, source: 'user' | 'llm', reason?: string }
-- The legacy `competitor_urls` text[] column is retained — population
-- code derives it from competitors_resolved so existing pipelines
-- (puppeteer price extraction, market-profile prompt) keep working
-- without retrofit.

alter table public.projects
  add column if not exists competitors_resolved jsonb default '[]'::jsonb;

-- competitor_names_user: the literal strings the user typed in the
-- wizard, before LLM resolution. Stored separately so the display
-- can always show "you typed X" even if the LLM later normalised the
-- name to "Brand Y Inc." or similar.
alter table public.projects
  add column if not exists competitor_names_user text[] default '{}';
