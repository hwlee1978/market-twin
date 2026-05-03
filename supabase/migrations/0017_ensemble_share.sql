-- 0017_ensemble_share.sql
--
-- Public sharable links for ensemble results. The owner generates a
-- token; anyone with the URL can view a read-only version of the
-- result without auth, until the token expires (default 30d) or is
-- revoked.
--
-- Two columns kept on the ensembles row instead of a separate table:
--   share_token       url-safe random string, unique when set
--   share_expires_at  null = never (we always set this from the API
--                     side; null only happens for legacy / revoked rows)
--
-- Token uniqueness is enforced by a partial unique index — partial so
-- the column can be set to null (revoked) without colliding with
-- another revoked row.

alter table public.ensembles
  add column if not exists share_token text,
  add column if not exists share_expires_at timestamptz;

create unique index if not exists ensembles_share_token_unique
  on public.ensembles (share_token)
  where share_token is not null;
