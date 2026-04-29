-- Workspace lifecycle status. Used by the admin console to suspend
-- abusive / non-paying workspaces and to archive permanently inactive ones.
--
-- Values:
--   active     — normal operation
--   suspended  — temporarily blocked (login still works, but project create /
--                simulation run should be blocked at the API layer)
--   archived   — permanently removed from active fleet but data retained for compliance
--
-- App-level enforcement: the regular tenant API routes need to check this
-- field before allowing writes. RLS would also work, but a status check
-- gives us more control over which exact actions to block.

create type workspace_status as enum ('active', 'suspended', 'archived');

alter table public.workspaces
  add column if not exists status workspace_status not null default 'active';

create index if not exists workspaces_status_idx
  on public.workspaces (status)
  where status <> 'active';
