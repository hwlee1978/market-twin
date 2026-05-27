-- Phase 2.2a — LLM Search visibility audit.
--
-- Stores results of probing major LLMs (Claude / GPT / Gemini) with
-- brand-relevant questions and parsing whether the workspace's brand
-- gets mentioned. The score answers: "do answer-engines know we exist
-- in this category yet?" — distinct from traditional Naver/Google SERP
-- rank. As LLM-driven discovery grows, this is the new SEO signal.

CREATE TABLE IF NOT EXISTS public.mrai_llm_visibility_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  marketing_channel_id UUID REFERENCES public.mrai_marketing_channels(id) ON DELETE SET NULL,
  -- Seed inputs
  brand_name TEXT NOT NULL,
  brand_category TEXT,
  market_country TEXT,
  test_queries JSONB NOT NULL DEFAULT '[]'::jsonb, -- ["best Korean merino sneakers", ...]
  -- Aggregate output
  visibility_score INTEGER, -- 0..100
  -- Per-LLM breakdown: { "claude": {...}, "gpt": {...}, "gemini": {...} }
  per_llm JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Competitive landscape — most-mentioned competitors and cited sources
  top_competitors JSONB DEFAULT '[]'::jsonb, -- [{ name, mentions }]
  top_sources JSONB DEFAULT '[]'::jsonb,     -- [{ domain, mentions }]
  -- Cost / observability
  llm_input_tokens INTEGER DEFAULT 0,
  llm_output_tokens INTEGER DEFAULT 0,
  cost_usd NUMERIC(10, 4) DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_mrai_llm_visibility_workspace
  ON public.mrai_llm_visibility_audits (workspace_id, generated_at DESC);

ALTER TABLE public.mrai_llm_visibility_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read llm visibility"
  ON public.mrai_llm_visibility_audits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = mrai_llm_visibility_audits.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "members insert llm visibility"
  ON public.mrai_llm_visibility_audits FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = mrai_llm_visibility_audits.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "members delete llm visibility"
  ON public.mrai_llm_visibility_audits FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = mrai_llm_visibility_audits.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.mrai_llm_visibility_audits IS
  'Probes Claude/GPT/Gemini with brand-relevant questions and measures '
  'whether the workspace brand appears in answer-engine responses. '
  'New SEO signal for the LLM-search era.';
