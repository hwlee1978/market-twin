-- Public beta feedback (2026-06-18).
--
-- Open-ended feedback submitted from the PUBLIC /beta landing page. Unlike
-- beta_result_feedback (per-ensemble, logged-in, workspace-scoped), this is
-- ANONYMOUS: anyone visiting /beta can submit without an account.
--
-- Privacy model: collection is private. RLS is enabled with NO policies, so
-- neither anon nor authenticated roles can read or write directly. Only the
-- server (service role, which bypasses RLS) inserts — via /api/beta-feedback
-- after validation — and only operators read it (Supabase dashboard / a
-- service-role admin view). This prevents spam/abuse exposure and keeps
-- submitter contact info out of client reach.

CREATE TABLE beta_public_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Optional 1-5 satisfaction, optional category, required message.
  rating SMALLINT CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  category TEXT CHECK (
    category IS NULL
    OR category IN ('bug', 'idea', 'usability', 'pricing', 'praise', 'other')
  ),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),

  -- Optional contact for follow-up (anonymous submission allowed).
  name TEXT CHECK (name IS NULL OR char_length(name) <= 100),
  email TEXT CHECK (email IS NULL OR char_length(email) <= 200),

  -- Context captured server-side.
  locale TEXT,
  user_agent TEXT,
  -- If the visitor happened to be logged in, record who (else NULL).
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Operator triage state.
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewed', 'archived'))
);

CREATE INDEX beta_public_feedback_created_idx
  ON beta_public_feedback(created_at DESC);
CREATE INDEX beta_public_feedback_status_idx
  ON beta_public_feedback(status);

-- RLS on, NO policies: blocks all anon/authenticated access. Service role
-- (server-only) bypasses RLS for inserts and operator reads.
ALTER TABLE beta_public_feedback ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE beta_public_feedback IS
  'Anonymous open feedback from the public /beta landing page. Private collection: RLS-enabled with no policies; only the service role (via /api/beta-feedback) writes and operators read.';
