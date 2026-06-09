-- Mr.AI integrations — multi-account per provider (2026-06-09).
--
-- Phase 1: X (Twitter) can connect multiple accounts per workspace
-- (e.g. @brand_us, @brand_kr for market/brand-specific publishing).
-- The 0032 unique index was (workspace_id, provider) — one account per
-- provider. Widen the key to include account_id so a second account on
-- the same provider INSERTS a new row instead of overwriting.
--
-- account_id is already populated by every store* helper (X user id,
-- LinkedIn sub, HubSpot hub id). The upsert onConflict in those helpers
-- is updated to (workspace_id, provider, account_id) in the same change.
-- LinkedIn/HubSpot stay single-account in the UI; the schema just allows
-- multiple rows uniformly.

drop index if exists public.mrai_integrations_ws_provider_uniq;

create unique index if not exists mrai_integrations_ws_provider_account_uniq
  on public.mrai_integrations(workspace_id, provider, account_id);
