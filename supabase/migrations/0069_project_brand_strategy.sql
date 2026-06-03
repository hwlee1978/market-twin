-- v0.2-A: Brand strategy input fields on projects table.
--
-- Motivation: K-Beauty D2C methodology benchmark (2026-06-03) revealed
-- that brand-specific GTM strategy (founder network, channel priority,
-- KOL relationships) is invisible to macro anchors (Comtrade · WB · DART).
-- Tirtir-class miss: actual JP-first success was driven by founder's
-- influencer group-buy network + Lotte duty-free strategy — neither
-- detectable from trade flow data alone. See:
--   proposals/K-Beauty-D2C-Hypothesis-Postmortem.md §1.2
--   proposals/K-Beauty-D2C-Comprehensive-Report.md §4.3
--
-- These 3 columns let the user supply brand-strategy hints that the
-- synthesis stage injects into prompts. All nullable — backwards
-- compatible. Empty/null means "no strategy hint provided" and sim
-- runs as before.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS founder_background TEXT,
  ADD COLUMN IF NOT EXISTS channel_priority TEXT,
  ADD COLUMN IF NOT EXISTS kol_relationships TEXT;

-- Length guards (defensive — UI also enforces). Free-text fields should
-- not bloat sim prompts; cap at 500 chars each.
ALTER TABLE projects
  ADD CONSTRAINT projects_founder_background_len CHECK (founder_background IS NULL OR char_length(founder_background) <= 500),
  ADD CONSTRAINT projects_kol_relationships_len CHECK (kol_relationships IS NULL OR char_length(kol_relationships) <= 500);

-- channel_priority enum check. Values mirror ChannelPriority zod enum
-- in packages/shared/src/simulation/schemas.ts.
ALTER TABLE projects
  ADD CONSTRAINT projects_channel_priority_valid
  CHECK (channel_priority IS NULL OR channel_priority IN (
    'online_first',
    'retail_first',
    'duty_free_first',
    'wholesale_first',
    'omni'
  ));

COMMENT ON COLUMN projects.founder_background IS
  'Free-text founder background hint (network, prior industry, etc). Max 500 chars. Used in synthesis prompt.';
COMMENT ON COLUMN projects.channel_priority IS
  'Brand''s preferred go-to-market channel category. One of online_first/retail_first/duty_free_first/wholesale_first/omni.';
COMMENT ON COLUMN projects.kol_relationships IS
  'Free-text KOL/influencer relationships hint (e.g. existing endorsements, organic followings). Max 500 chars.';
