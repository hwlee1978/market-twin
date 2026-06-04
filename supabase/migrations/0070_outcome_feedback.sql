-- A3: Outcome feedback corpus (2026-06-05).
--
-- Motivation: 6-brand backtest (commits 768771d, ca36ced) showed 100%
-- winner hit using hindsight data. To measure REAL production accuracy
-- we need users to submit their actual launch outcomes after running
-- a sim. That dataset enables:
--   1. STRONG/MODERATE/WEAK calibration check ("does STRONG actually hit
--      80%+ in production?")
--   2. Per-LLM × per-category weight tuning (PHASE_F2 activation)
--   3. New benchmark fixtures from real customer data
--
-- One row per project × outcome submission. Users can update over time
-- as launch evolves (planning → launched → pivoted → abandoned).

CREATE TABLE outcome_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- What actually happened
  launch_status TEXT NOT NULL CHECK (launch_status IN (
    'planning',    -- haven't launched yet
    'launched',    -- went live in a market
    'pivoted',     -- launched but pivoted to different market/strategy
    'abandoned'    -- decided not to pursue
  )),
  launch_country TEXT,  -- ISO-2 code, required when launch_status in ('launched', 'pivoted')
  launch_date DATE,     -- when the launch went live

  -- Free-form qualitative outcome
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 2000),

  -- Optional quantitative outcome (loose schema so users can fill what they have)
  -- Example: { "revenue_first_3mo_usd": 50000, "channel_mix": ["amazon", "d2c"], "growth_yoy_pct": 120 }
  outcome_metrics JSONB,
  launched_via_channels TEXT[] DEFAULT '{}',

  -- Snapshot of what the sim recommended at submit time. Frozen so it
  -- doesn't drift if the user re-runs sims later — this is the comparison
  -- baseline. Populated by the POST API from the project's latest
  -- completed ensemble's aggregate_result.recommendation.
  recommendation_country TEXT,
  recommendation_confidence TEXT CHECK (
    recommendation_confidence IS NULL OR recommendation_confidence IN ('STRONG', 'MODERATE', 'WEAK')
  ),
  recommendation_ensemble_id UUID REFERENCES ensembles(id) ON DELETE SET NULL,

  -- Derived: did the actual launch match the system's recommendation?
  -- NULL when launch_status is 'planning' or 'abandoned' (no launch country yet).
  matched_recommendation BOOLEAN GENERATED ALWAYS AS (
    CASE
      WHEN launch_country IS NULL OR recommendation_country IS NULL THEN NULL
      ELSE upper(launch_country) = upper(recommendation_country)
    END
  ) STORED
);

CREATE INDEX outcome_feedback_workspace_idx ON outcome_feedback(workspace_id);
CREATE INDEX outcome_feedback_project_idx ON outcome_feedback(project_id);
CREATE INDEX outcome_feedback_submitted_at_idx ON outcome_feedback(submitted_at DESC);
-- For calibration queries: "of all STRONG recommendations, how many matched?"
CREATE INDEX outcome_feedback_calibration_idx
  ON outcome_feedback(recommendation_confidence, matched_recommendation)
  WHERE recommendation_confidence IS NOT NULL AND matched_recommendation IS NOT NULL;

-- RLS: workspace members can read/write their own workspace's feedback.
-- Admins can read all (handled via service-role client in admin routes).
ALTER TABLE outcome_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY outcome_feedback_workspace_read
  ON outcome_feedback FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY outcome_feedback_workspace_insert
  ON outcome_feedback FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
    AND submitted_by = auth.uid()
  );

CREATE POLICY outcome_feedback_workspace_update
  ON outcome_feedback FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY outcome_feedback_workspace_delete
  ON outcome_feedback FOR DELETE
  USING (
    submitted_by = auth.uid()
    OR workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

COMMENT ON TABLE outcome_feedback IS
  'Real launch outcomes submitted by users post-sim. Powers production accuracy KPI + calibration loop.';
COMMENT ON COLUMN outcome_feedback.recommendation_country IS
  'Snapshot of the sim recommendation at submit time. Frozen for honest comparison.';
COMMENT ON COLUMN outcome_feedback.matched_recommendation IS
  'Auto-derived: did the actual launch match the sim recommendation? NULL when no launch country yet.';
