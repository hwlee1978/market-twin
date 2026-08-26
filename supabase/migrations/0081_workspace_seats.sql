-- Team seats (v0.2)
--
-- The pricing page has sold "3 user seats" (Growth) and "10+ seats"
-- (Enterprise) since launch, but the product had no way to put a second
-- person in a workspace: RLS policy `wm_insert_self_first` (migration 0001)
-- only ever allowed a user to insert *themselves* as a member, and there was
-- no invitation flow at all. Migration 0038 already dropped the
-- one-workspace-per-owner index and the switcher supports multi-membership,
-- so what is missing is the invite path and admin-side member management.
--
-- This migration adds:
--   1) is_workspace_admin(ws) — owner/admin predicate, mirrors is_workspace_member
--   2) workspace_invitations   — pending invites, token stored hashed
--   3) RLS so owners/admins can manage members and invitations
--   4) A guard so the last owner of a workspace can never be removed or demoted
--
-- Accepting an invite runs through the API with the service role (the
-- accepting user is by definition not yet a member, so no client-side policy
-- could authorise the insert). The policies below are the defence-in-depth
-- layer for everything else.
--
-- Re-runnable: every create is guarded, and policies are dropped first
-- because Postgres has no CREATE POLICY IF NOT EXISTS.

-- ──────────────────────────────────────────────────────────────────────────
-- 1) Role predicate
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.is_workspace_admin(ws uuid)
returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = ws
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  );
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 2) Invitations
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.workspace_invitations (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  -- Stored lowercase/trimmed by the API. The unique index below keys on it
  -- directly, so any writer must normalise before insert.
  email           text not null,
  role            workspace_role not null default 'analyst',
  -- sha256 of the raw token. The raw value exists only in the invite link
  -- we email; a database leak must not hand out working invitations.
  token_hash      text not null,
  invited_by      uuid references auth.users(id) on delete set null,
  status          text not null default 'pending'
                    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at      timestamptz not null,
  accepted_at     timestamptz,
  accepted_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- At most one live invitation per (workspace, email). Re-inviting the same
-- address expires or reuses the existing row rather than stacking.
create unique index if not exists workspace_invitations_pending_unique
  on public.workspace_invitations (workspace_id, email)
  where status = 'pending';

create index if not exists workspace_invitations_token_idx
  on public.workspace_invitations (token_hash);

create index if not exists workspace_invitations_email_idx
  on public.workspace_invitations (email)
  where status = 'pending';

alter table public.workspace_invitations enable row level security;

-- Members can see their workspace's invitations (the team page lists them);
-- only owners/admins can create, revoke, or otherwise modify them.
drop policy if exists "wi_select_members" on public.workspace_invitations;
create policy "wi_select_members" on public.workspace_invitations
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists "wi_insert_admins" on public.workspace_invitations;
create policy "wi_insert_admins" on public.workspace_invitations
  for insert with check (public.is_workspace_admin(workspace_id));

drop policy if exists "wi_update_admins" on public.workspace_invitations;
create policy "wi_update_admins" on public.workspace_invitations
  for update using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

drop policy if exists "wi_delete_admins" on public.workspace_invitations;
create policy "wi_delete_admins" on public.workspace_invitations
  for delete using (public.is_workspace_admin(workspace_id));

-- ──────────────────────────────────────────────────────────────────────────
-- 3) Member management
--    0001 gave workspace_members SELECT + insert-self only. Owners/admins
--    now need to change roles and remove people.
-- ──────────────────────────────────────────────────────────────────────────
drop policy if exists "wm_update_admins" on public.workspace_members;
create policy "wm_update_admins" on public.workspace_members
  for update using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

-- A member may always remove themselves (leave the workspace); owners and
-- admins may remove anyone. The last-owner trigger below still applies.
drop policy if exists "wm_delete_admins_or_self" on public.workspace_members;
create policy "wm_delete_admins_or_self" on public.workspace_members
  for delete using (
    public.is_workspace_admin(workspace_id) or user_id = auth.uid()
  );

-- ──────────────────────────────────────────────────────────────────────────
-- 4) Never strand a workspace without an owner
--    Enforced in the database rather than only in the API, because
--    "remove member", "leave workspace", and "change role" are three
--    separate paths that would each have to remember the rule.
--
--    NEW is unassigned in a DELETE trigger, so every branch below is keyed
--    off TG_OP rather than coalescing the two records.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer as $$
declare
  remaining int;
begin
  -- Only an owner row losing ownership can strand the workspace.
  if old.role <> 'owner' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op = 'UPDATE' and new.role = 'owner' then
    return new;
  end if;

  select count(*) into remaining
  from public.workspace_members
  where workspace_id = old.workspace_id
    and role = 'owner'
    and user_id <> old.user_id;

  if remaining = 0 then
    raise exception 'last_owner'
      using hint = 'Promote another member to owner before removing this one.';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists workspace_members_last_owner on public.workspace_members;
create trigger workspace_members_last_owner
  before update or delete on public.workspace_members
  for each row execute function public.prevent_last_owner_removal();

comment on table public.workspace_invitations is
  'Pending/accepted seat invitations. token_hash is sha256 of the emailed token; the raw token is never stored.';
