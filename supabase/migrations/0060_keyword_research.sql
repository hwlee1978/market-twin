-- Phase 2.1 — keyword research cache (Naver + Google).
--
-- Stores LLM-distilled keyword intelligence per (workspace, channel
-- platform, market). Generated on-demand and re-runnable; the cache
-- avoids paying for LLM + Tavily every page render.

CREATE TABLE IF NOT EXISTS public.mrai_keyword_research (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  marketing_channel_id UUID REFERENCES public.mrai_marketing_channels(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  market_country TEXT,
  -- Seed inputs for traceability (so the user knows what was searched).
  seed_topic TEXT,
  brand_category TEXT,
  -- Output payload — an array of { keyword, volume_tier, trend, source, intent, notes }
  keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Bookkeeping
  llm_input_tokens INTEGER DEFAULT 0,
  llm_output_tokens INTEGER DEFAULT 0,
  cost_usd NUMERIC(10, 4) DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_mrai_keyword_research_channel
  ON public.mrai_keyword_research (marketing_channel_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_mrai_keyword_research_workspace
  ON public.mrai_keyword_research (workspace_id, generated_at DESC);

ALTER TABLE public.mrai_keyword_research ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read keyword research"
  ON public.mrai_keyword_research FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = mrai_keyword_research.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "members insert keyword research"
  ON public.mrai_keyword_research FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = mrai_keyword_research.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "members delete keyword research"
  ON public.mrai_keyword_research FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = mrai_keyword_research.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.mrai_keyword_research IS
  'Mr.AI keyword intelligence — Naver + Google data distilled via '
  'Tavily web search + Claude Sonnet. Per workspace/channel cache.';
