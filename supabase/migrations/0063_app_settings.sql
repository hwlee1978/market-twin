-- App-wide runtime settings — key/value store gated behind super-admin.
--
-- Until now toggles like signup-enabled were Vercel env vars, requiring
-- a redeploy to flip. This table lets super-admin operators flip them
-- instantly from /admin/site-settings without touching env config.
--
-- v0.1 scope: signup gate. Future use: invite-only mode, maintenance
-- banner, feature flags for slow-rollout features. The schema is
-- intentionally generic so we don't migrate per-flag.

create table if not exists public.app_settings (
  key          text primary key,
  value        jsonb not null,
  description  text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id) on delete set null
);

-- Service-role only — never expose via RLS. Reads go through a
-- server helper that uses createServiceClient; writes are gated on
-- requireSuperAdmin() at the route handler. RLS off keeps the table
-- invisible to client SDKs.
alter table public.app_settings disable row level security;

-- Seed signup gate. Default = closed (matches current env var
-- behaviour when NEXT_PUBLIC_SIGNUP_ENABLED is unset).
insert into public.app_settings (key, value, description)
values
  (
    'signup_enabled',
    'false'::jsonb,
    'When true, /signup serves the real SignupForm. When false, SignupComingSoon.'
  )
on conflict (key) do nothing;

comment on table public.app_settings is
  'Runtime app settings flipped by super-admins. Replaces Vercel env vars for toggles that should not require redeploy.';
