-- Workspace integrity hardening
--
-- Two issues surfaced in production:
--
-- 1. Race condition in getOrCreatePrimaryWorkspace() created duplicate
--    workspaces for the same user when multiple parallel requests all hit
--    the bootstrap path on first login. App-level checks alone can't prevent
--    this — we need a DB-level guard.
--
-- 2. Deleting a workspace failed because audit_logs has no ON DELETE policy
--    on its workspace_id FK. For audit log compliance we want to PRESERVE
--    the log entries even when the workspace is gone, so we switch to
--    ON DELETE SET NULL (the action/actor info stays intact for forensics).
--
-- Both changes are idempotent so the migration is safe to re-run.

-- ──────────────────────────────────────────────────────────────────────────
-- 1) Prevent duplicate owner workspaces per user
-- ──────────────────────────────────────────────────────────────────────────
-- v0.1 policy: one user owns exactly one workspace. The DB rejects any second
-- owner-row insert for the same user, so even a race condition can't create
-- a phantom workspace. (Multi-workspace ownership is deferred to v0.2 — when
-- that lands we'll drop this index.)
create unique index if not exists workspace_members_owner_unique
  on public.workspace_members (user_id)
  where role = 'owner';

-- ──────────────────────────────────────────────────────────────────────────
-- 2) Preserve audit logs across workspace deletion
-- ──────────────────────────────────────────────────────────────────────────
alter table public.audit_logs
  drop constraint if exists audit_logs_workspace_id_fkey;

alter table public.audit_logs
  add constraint audit_logs_workspace_id_fkey
    foreign key (workspace_id)
    references public.workspaces(id)
    on delete set null;
