-- AI Market Twin — initial schema (v0.1 MVP)
-- Maps to Modules A–L from the Functional Specification.
-- All tenant data is keyed by workspace_id; RLS enforces workspace membership.

create extension if not exists "uuid-ossp";

-- ──────────────────────────────────────────────────────────────────────────
-- Workspaces & membership
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.workspaces (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  company_name    text,
  industry        text,
  country         text,
  plan            text not null default 'starter',
  created_at      timestamptz not null default now()
);

create type workspace_role as enum ('owner', 'admin', 'analyst', 'viewer');

create table if not exists public.workspace_members (
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            workspace_role not null default 'analyst',
  created_at      timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_idx on public.workspace_members(user_id);

-- ──────────────────────────────────────────────────────────────────────────
-- Projects
-- ──────────────────────────────────────────────────────────────────────────
create type project_status as enum ('draft', 'ready', 'running', 'completed', 'failed', 'archived');

create table if not exists public.projects (
  id                  uuid primary key default uuid_generate_v4(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  created_by          uuid references auth.users(id),
  name                text not null,
  product_name        text not null,
  category            text,
  description         text,
  base_price_cents    integer,
  currency            text default 'USD',
  objective           text,
  candidate_countries text[] default '{}',
  competitor_urls     text[] default '{}',
  status              project_status not null default 'draft',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists projects_workspace_idx on public.projects(workspace_id);

create table if not exists public.project_assets (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  storage_path    text not null,
  file_name       text,
  mime_type       text,
  size_bytes      integer,
  created_at      timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────────────────
-- Simulations
-- ──────────────────────────────────────────────────────────────────────────
create type simulation_status as enum ('pending', 'running', 'completed', 'failed', 'cancelled');

create table if not exists public.simulations (
  id                  uuid primary key default uuid_generate_v4(),
  project_id          uuid not null references public.projects(id) on delete cascade,
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  status              simulation_status not null default 'pending',
  model_provider      text,
  model_version       text,
  persona_count       integer not null default 200,
  current_stage       text,
  error_message       text,
  started_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists simulations_project_idx on public.simulations(project_id);
create index if not exists simulations_workspace_idx on public.simulations(workspace_id);

-- One row per simulation; full result blob stored as JSONB for v0.1.
-- Move to normalized tables (countries, personas, scores) when scale demands.
create table if not exists public.simulation_results (
  simulation_id   uuid primary key references public.simulations(id) on delete cascade,
  overview        jsonb,
  countries       jsonb,
  personas        jsonb,
  pricing         jsonb,
  creative        jsonb,
  risks           jsonb,
  recommendations jsonb,
  created_at      timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────────────────
-- Reports
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.reports (
  id              uuid primary key default uuid_generate_v4(),
  simulation_id   uuid not null references public.simulations(id) on delete cascade,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  format          text not null default 'pdf',
  storage_path    text,
  download_count  integer not null default 0,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────────────────
-- Audit log
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.audit_logs (
  id              bigserial primary key,
  ts              timestamptz not null default now(),
  actor_id        uuid references auth.users(id),
  workspace_id    uuid references public.workspaces(id),
  action          text not null,
  resource_type   text,
  resource_id     text,
  metadata        jsonb,
  ip              inet
);

create index if not exists audit_logs_workspace_idx on public.audit_logs(workspace_id, ts desc);

-- ──────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ──────────────────────────────────────────────────────────────────────────
alter table public.workspaces            enable row level security;
alter table public.workspace_members     enable row level security;
alter table public.projects              enable row level security;
alter table public.project_assets        enable row level security;
alter table public.simulations           enable row level security;
alter table public.simulation_results    enable row level security;
alter table public.reports               enable row level security;
-- audit_logs has RLS enabled but NO policies — only service_role can write/read.
-- This is intentional: audit logs are server-only, never exposed to clients.
alter table public.audit_logs            enable row level security;

create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = ws and wm.user_id = auth.uid()
  );
$$;

-- workspaces: members can read; only owners can update via direct table writes.
-- v0.1 uses service-role for plan changes, so we only expose SELECT here.
create policy "ws_select_members" on public.workspaces
  for select using (public.is_workspace_member(id));

create policy "ws_insert_owner" on public.workspaces
  for insert with check (true);  -- creator becomes owner via app code

create policy "wm_select_self_ws" on public.workspace_members
  for select using (public.is_workspace_member(workspace_id) or user_id = auth.uid());

create policy "wm_insert_self_first" on public.workspace_members
  for insert with check (user_id = auth.uid());

create policy "projects_rw_members" on public.projects
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "project_assets_rw_members" on public.project_assets
  for all using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and public.is_workspace_member(p.workspace_id)
    )
  );

create policy "sim_rw_members" on public.simulations
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "sim_results_r_members" on public.simulation_results
  for select using (
    exists (
      select 1 from public.simulations s
      where s.id = simulation_id and public.is_workspace_member(s.workspace_id)
    )
  );
-- writes to simulation_results happen via service role only

create policy "reports_rw_members" on public.reports
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
