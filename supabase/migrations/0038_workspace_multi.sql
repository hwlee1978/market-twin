-- Workspace switcher (v0.2 lift)
--
-- v0.1 hardwired 1 user = 1 workspace via the unique-owner index added in
-- migration 0005. Le Mouton onboarding (and any future multi-tenant
-- consulting use) needs the same human to own multiple workspaces — one
-- per client / portfolio company — without juggling separate accounts.
--
-- Changes:
--   1) Drop the owner-unique index so a user can own multiple workspaces.
--   2) Add helper view + function for "workspaces I can see" (used by the
--      switcher dropdown).
--   3) RLS already allows multi-membership (workspace_members PK is
--      (workspace_id, user_id)), no policy changes needed.
--
-- Active-workspace selection lives in a cookie (`aw_id`), set by the
-- /api/workspaces/switch endpoint. No DB column needed for that — keeping
-- it stateless means switching is one HTTP round-trip, not a write.

-- 1) Allow multi-ownership
drop index if exists public.workspace_members_owner_unique;

-- 2) Helper: workspaces the current user is a member of, with role.
--    Used by WorkspaceSwitcher dropdown and the create-workspace API
--    (to count "owned" workspaces for plan enforcement later).
create or replace function public.list_my_workspaces()
returns table (
  workspace_id uuid,
  name text,
  company_name text,
  role workspace_role,
  status text,
  is_active boolean,
  created_at timestamptz
)
language sql
security definer
stable as $$
  select
    w.id as workspace_id,
    w.name,
    w.company_name,
    wm.role,
    coalesce(w.status, 'active') as status,
    false as is_active,  -- filled in by the caller from the cookie
    w.created_at
  from public.workspaces w
  join public.workspace_members wm on wm.workspace_id = w.id
  where wm.user_id = auth.uid()
  order by w.created_at asc;
$$;

grant execute on function public.list_my_workspaces() to authenticated;
