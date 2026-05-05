-- 0020_trial_abuse_guard.sql
--
-- Trial-abuse defenses. Prior to this migration, a single human could
-- spin up unlimited "free 7-day trials" by creating new accounts on
-- different emails. We block three patterns:
--
--   1) Same email-domain (e.g. +1, +2 aliasing on gmail) — all
--      "name+anything@domain.com" normalises to the same canonical
--      email; only one trial allowed per canonical
--   2) Same signup IP (best-effort — proxies and CGNAT bypass it,
--      but stops casual incognito-tab abuse)
--   3) Sliding hourly cap — per-IP & per-email-domain rate limit so
--      a script can't fan out 50 accounts in 5 minutes
--
-- We log every signup attempt with the canonical email + IP. The
-- workspace bootstrap reads recent attempts to decide whether to
-- grant the 1-sim trial or downgrade to a "view-only" state requiring
-- card-on-file before any sim runs.

create table if not exists public.signup_attempts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  -- Raw email as entered (kept for debugging, never used as a key)
  email_raw text not null,
  -- Canonicalised: lowercased + plus-tag stripped from the local-part.
  -- "Foo.Bar+promo@Gmail.COM" → "foo.bar@gmail.com"
  email_canonical text not null,
  -- Domain extracted from canonical email — fast index for "how many
  -- trials has this domain produced lately"
  email_domain text not null,
  -- Best-effort IP from the signup HTTP request. May be a proxy IP.
  ip_address text,
  -- Whether the trial was granted (true) or denied (false) at this
  -- attempt. Lets the abuse-detection logic count past denials too.
  trial_granted boolean not null default true,
  -- Reason if denied — short slug for analytics ("dup_canonical",
  -- "ip_rate_limit", "domain_rate_limit", etc.)
  denial_reason text,
  created_at timestamptz not null default now()
);

create index if not exists signup_attempts_canonical_idx
  on public.signup_attempts (email_canonical, created_at desc);
create index if not exists signup_attempts_domain_idx
  on public.signup_attempts (email_domain, created_at desc);
create index if not exists signup_attempts_ip_idx
  on public.signup_attempts (ip_address, created_at desc)
  where ip_address is not null;

-- RLS: only service-role reads/writes. End users never query this.
alter table public.signup_attempts enable row level security;
-- (no policies = RLS denies by default; service_role bypasses)
