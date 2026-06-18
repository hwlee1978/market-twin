-- Beta micro-survey (2026-06-18).
--
-- Collected on the ensemble results screen during the open beta to
-- quantify "was this result useful for your decision?" (1-5) plus an
-- optional one-line comment. Feeds the beta KPI (result satisfaction)
-- and the qualitative feedback corpus.
--
-- One row per (ensemble × user); re-submitting updates the same row
-- (enforced by the UNIQUE constraint + upsert in the POST API).

CREATE TABLE beta_result_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ensemble_id UUID NOT NULL REFERENCES ensembles(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- "이 결과가 의사결정에 도움이 되나요?" 1(전혀) ~ 5(매우 도움)
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  -- 자유 한 줄
  comment TEXT CHECK (comment IS NULL OR char_length(comment) <= 500),

  UNIQUE (ensemble_id, submitted_by)
);

CREATE INDEX beta_result_feedback_workspace_idx ON beta_result_feedback(workspace_id);
CREATE INDEX beta_result_feedback_ensemble_idx ON beta_result_feedback(ensemble_id);
CREATE INDEX beta_result_feedback_submitted_at_idx ON beta_result_feedback(submitted_at DESC);

ALTER TABLE beta_result_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY beta_result_feedback_workspace_read
  ON beta_result_feedback FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY beta_result_feedback_workspace_insert
  ON beta_result_feedback FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
    AND submitted_by = auth.uid()
  );

CREATE POLICY beta_result_feedback_workspace_update
  ON beta_result_feedback FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
    AND submitted_by = auth.uid()
  );

COMMENT ON TABLE beta_result_feedback IS
  'Beta micro-survey: per-ensemble result satisfaction (1-5) + one-line comment. Powers the beta result-usefulness KPI.';
