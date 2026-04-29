-- Admin console — internal staff users with cross-workspace operational access.
-- Distinct from workspace_members: admin_users see/act across ALL tenants and
-- never appear as members of customer workspaces.
--
-- Roles map to the 6 personas from the Admin Console Design Spec:
--   super       — full access, including billing, model rollout, impersonation
--   operations  — customer/workspace/project management, support tools
--   customer    — Customer Success: read customer data + reports + tickets
--   finance     — billing, invoices, plan changes, payment failures
--   ml_ops      — model versions, simulation quality, prompt templates
--   support     — read-only customer + simulation logs, support notes

create type admin_role as enum ('super', 'operations', 'customer', 'finance', 'ml_ops', 'support');

create table if not exists public.admin_users (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  role        admin_role not null default 'support',
  created_at  timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- An admin can read their own admin_users row to discover their role.
-- The full table (other admins) is not exposed via the API; reads happen via service role.
create policy "admin_users_read_self" on public.admin_users
  for select using (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────────────────────
-- is_admin() helper — fast check used by app code and policies on other tables.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
  );
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- Cross-workspace admin read access on tenant data tables.
-- Admins can SELECT everything (for ops dashboards, support, debugging).
-- Writes from the admin console go through service role, not these policies.
-- ──────────────────────────────────────────────────────────────────────────
create policy "admin_read_all_workspaces" on public.workspaces
  for select to authenticated using (public.is_admin());

create policy "admin_read_all_workspace_members" on public.workspace_members
  for select to authenticated using (public.is_admin());

create policy "admin_read_all_projects" on public.projects
  for select to authenticated using (public.is_admin());

create policy "admin_read_all_simulations" on public.simulations
  for select to authenticated using (public.is_admin());

create policy "admin_read_all_simulation_results" on public.simulation_results
  for select to authenticated using (public.is_admin());

create policy "admin_read_all_reports" on public.reports
  for select to authenticated using (public.is_admin());

create policy "admin_read_all_audit_logs" on public.audit_logs
  for select to authenticated using (public.is_admin());

-- ──────────────────────────────────────────────────────────────────────────
-- Bootstrap: first admin must be added manually via service role / SQL editor.
-- After this migration runs, run from Supabase SQL Editor:
--   insert into public.admin_users (user_id, role)
--   values ('YOUR-USER-UUID-HERE', 'super');
--
-- (Find your UUID at Authentication → Users → click your row → User UID.)
-- ──────────────────────────────────────────────────────────────────────────
