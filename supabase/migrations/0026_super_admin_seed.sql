-- Promote the founder account (hwlee197874@gmail.com) to super admin so
-- it has cross-workspace ops access AND bypasses plan/quota checks in
-- the run-ensemble route. Idempotent — safe to re-run.
--
-- The bypass logic lives in src/app/api/projects/[id]/run-ensemble/route.ts:
-- when getAdminContext() returns role='super', canStartSim is skipped.

insert into public.admin_users (user_id, role)
select id, 'super'::admin_role
from auth.users
where email = 'hwlee197874@gmail.com'
on conflict (user_id) do update
set role = 'super';
