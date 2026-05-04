-- 0018_first_result_seen.sql
--
-- Tracks whether a workspace member has seen the "first ensemble result"
-- welcome modal. Stored on workspace_members (not workspaces) so each
-- collaborator gets the modal independently — useful when a teammate
-- joins a workspace that already has results.
--
-- Null = never seen the modal. The dashboard checks this on first
-- ensemble load and fires the modal if both: (a) field is null AND
-- (b) the workspace has at least one completed ensemble. The PATCH
-- writes the timestamp once dismissed so it never fires again.

alter table public.workspace_members
  add column if not exists first_result_seen_at timestamptz;
