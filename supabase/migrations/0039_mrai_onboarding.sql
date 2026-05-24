-- Mr. AI workspace onboarding state
--
-- Tracks when the workspace finished the guided interview. Until this is set,
-- /mr-ai opens the OnboardingPanel instead of the default Briefing tab so
-- new workspaces (Le Mouton, portfolio companies, internal demos) don't see
-- an empty Briefing and wonder where to start.
--
-- We track only the completion timestamp here. Per-step progress is derived
-- from mrai_memories rows (each step writes one memory tagged with the
-- step id in the metadata), so reload-safety is automatic and there's no
-- separate progress table to keep in sync.

alter table public.workspaces
  add column if not exists mrai_onboarded_at timestamptz;

-- Index isn't strictly needed (one lookup per /mr-ai page load), but it
-- keeps the column eligible for partial indexes later (e.g. "find all
-- workspaces still mid-onboarding for outreach").
create index if not exists workspaces_mrai_onboarded_idx
  on public.workspaces(mrai_onboarded_at)
  where mrai_onboarded_at is null;

-- Mark which memory came from which onboarding step. Lets us upsert on
-- replay (user edits an answer) without colliding with user-created
-- memories that happen to share a title. NULL means "regular memory,
-- not onboarding-tied" — the existing extraction pipeline never sets it.
alter table public.mrai_memories
  add column if not exists onboarding_step text;

create unique index if not exists mrai_memories_ws_onboarding_step_uniq
  on public.mrai_memories(workspace_id, onboarding_step)
  where onboarding_step is not null;
