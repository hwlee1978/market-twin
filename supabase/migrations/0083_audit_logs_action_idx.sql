-- Index audit_logs by (action, ts) for alert de-duplication.
--
-- The ops-alert path and the system-health cron both ask the same
-- question on every call: "did we already report this in the last N
-- minutes?" — a filter on `action` plus a `ts` lower bound. The only
-- index on this table is (workspace_id, ts), and operational alerts
-- carry no workspace, so both lookups were sequential scans over the
-- whole audit log. That cost grows with every row the table ever
-- accumulates, on a path that runs inside the simulation pipeline.
--
-- resource_id is included because alerts dedupe per subject (a specific
-- ensemble), not just per kind.

create index if not exists audit_logs_action_ts_idx
  on public.audit_logs (action, ts desc);

create index if not exists audit_logs_action_resource_ts_idx
  on public.audit_logs (action, resource_id, ts desc);
