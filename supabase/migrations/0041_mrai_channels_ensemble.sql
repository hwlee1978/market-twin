-- Extend Mr. AI channels to receive ensemble-complete notifications.
--
-- Until now mrai_channels only had send_briefing — Daily Briefings
-- fan out to Slack/Email/Webhook, but simulation-complete notifications
-- went only via Resend (legacy Market Twin path) and skipped Slack.
-- Users noticed mid-2026-05-24 that Slack stayed silent when their
-- ensemble finished. This adds a separate toggle so each kind of
-- notification can be opted in/out independently per channel.
--
-- Default true on existing rows: most channels users already created
-- (르무통 Slack #새-채널, etc.) want both kinds. They can flip the
-- new toggle off later if they need only morning briefings.

alter table public.mrai_channels
  add column if not exists send_ensemble_complete boolean not null default true;
