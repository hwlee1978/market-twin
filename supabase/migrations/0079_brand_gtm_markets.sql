-- v0.3: Structured per-country GTM signals on projects table.
--
-- Motivation: the N=20 cross-origin backtest (2026-07) confirmed that the
-- remaining accuracy lever is brand-specific GTM — the true winning market is
-- often decided by an existing footprint or a distribution/licensing partner
-- (Shake Shack → UAE via the Alshaya group), which the macro anchors can't
-- see. Migration 0069 added free-text hints; these three ISO-2 arrays make the
-- signal crisp and directly weightable per market, so the country ranker can
-- boost the exact markets where the brand has a concrete advantage.
--
--   existing_markets — brand already sells / has traction / inbound orders
--   partner_markets  — has a distributor / retail / licensing partner or LOI
--   network_markets  — founder / team has a strong network / relationships
--
-- All nullable text[] — backwards compatible; null/empty means "not provided".

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS existing_markets TEXT[],
  ADD COLUMN IF NOT EXISTS partner_markets TEXT[],
  ADD COLUMN IF NOT EXISTS network_markets TEXT[];

-- Length guards (defensive — UI also enforces). Bounded to the 24 supported
-- markets; each entry is an ISO-2 code.
ALTER TABLE projects
  ADD CONSTRAINT projects_existing_markets_len CHECK (existing_markets IS NULL OR array_length(existing_markets, 1) <= 24),
  ADD CONSTRAINT projects_partner_markets_len CHECK (partner_markets IS NULL OR array_length(partner_markets, 1) <= 24),
  ADD CONSTRAINT projects_network_markets_len CHECK (network_markets IS NULL OR array_length(network_markets, 1) <= 24);
