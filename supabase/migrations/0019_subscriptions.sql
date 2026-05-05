-- 0019_subscriptions.sql
--
-- Subscription state per workspace. Splits from workspaces.plan (which
-- exists but was a placeholder) so we can track trial state, billing
-- period, payment-provider linkage (Stripe + 토스페이먼츠), and
-- cancellation flow without bloating the workspace row.
--
-- One row per workspace. workspaces.plan stays for legacy queries that
-- only need a label; this table is the source of truth for billing.

create table if not exists public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,

  -- Plan tier: free_trial / starter / growth / enterprise
  -- Hardcoded enum-as-text so plan definitions can evolve in app code
  -- without a migration on every change to limits / features.
  plan text not null default 'free_trial',

  -- Status: trialing / active / past_due / canceled / paused
  --   trialing — inside the 7-day window or trial sim quota
  --   active   — paid plan, billed, in good standing
  --   past_due — last invoice failed; grace window before downgrade
  --   canceled — user-initiated cancellation; access ends at period_end
  --   paused   — admin-paused (compliance, dispute, etc.)
  status text not null default 'trialing',

  -- Trial state (only meaningful while plan='free_trial')
  trial_started_at timestamptz default now(),
  -- Trial ends at the earlier of: trial_ends_at OR when trial_sims_used >= trial_sims_limit
  trial_ends_at timestamptz,
  trial_sims_used int not null default 0,
  trial_sims_limit int not null default 1,

  -- Billing period (set after first paid subscription kicks in)
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,

  -- Payment provider linkage. Exactly one of stripe / toss should be set
  -- once the workspace upgrades; both null means trial / unpaid.
  payment_provider text, -- 'stripe' | 'tosspayments'
  stripe_customer_id text,
  stripe_subscription_id text,
  toss_customer_key text, -- 토스 customerKey (UUID we generate, sent on every billing call)
  toss_billing_key text, -- 토스 billingKey (returned after first card auth, used for recurring)

  -- Billing currency + cycle. Locked at first paid checkout — changing
  -- requires cancel + re-subscribe. USD on Stripe path, KRW on Toss path.
  billing_currency text not null default 'USD', -- 'USD' | 'KRW'
  billing_interval text not null default 'monthly', -- 'monthly' | 'annual'

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  notes text
);

-- Provider-id uniqueness — partial unique indexes so multiple null rows
-- (workspaces never linked to a provider yet) coexist without colliding.
create unique index if not exists subscriptions_stripe_sub_unique
  on public.subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

create unique index if not exists subscriptions_toss_billing_unique
  on public.subscriptions (toss_billing_key)
  where toss_billing_key is not null;

-- Auto-bump updated_at on row mutation so we can tell when plan / status
-- last changed without joining audit_logs.
create or replace function public.subscriptions_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists subscriptions_touch on public.subscriptions;
create trigger subscriptions_touch
  before update on public.subscriptions
  for each row execute function public.subscriptions_touch_updated_at();

-- Audit trail of plan / status transitions — separate table so we can
-- show "you upgraded from Starter to Growth on 2026-06-01" in the
-- billing UI without scanning the live row.
create table if not exists public.subscription_events (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- Event type: trial_started / trial_ended / plan_changed / status_changed
  --   / payment_succeeded / payment_failed / canceled / reactivated
  event text not null,
  from_plan text,
  to_plan text,
  from_status text,
  to_status text,
  amount_cents int,
  currency text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists subscription_events_workspace_idx
  on public.subscription_events (workspace_id, created_at desc);

-- Backfill: every existing workspace gets a free_trial subscription row.
-- Trial windows are set NULL → app code treats them as "no time-based
-- trial limit" for legacy workspaces (we don't want to retroactively
-- expire someone who's been using the system).
insert into public.subscriptions (workspace_id, plan, status, trial_started_at, trial_ends_at, trial_sims_limit)
select
  w.id,
  'free_trial',
  'trialing',
  w.created_at,
  null,            -- legacy: no time-based expiry
  999999           -- legacy: effectively unlimited trial sims
from public.workspaces w
left join public.subscriptions s on s.workspace_id = w.id
where s.id is null
on conflict (workspace_id) do nothing;

-- RLS: a workspace member can READ their workspace's subscription row.
-- Writes go through service-role from the billing API + webhooks.
alter table public.subscriptions enable row level security;
alter table public.subscription_events enable row level security;

drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists subscription_events_select on public.subscription_events;
create policy subscription_events_select on public.subscription_events
  for select using (public.is_workspace_member(workspace_id));
