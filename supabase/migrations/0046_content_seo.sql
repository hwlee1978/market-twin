-- SEO extension for content_drafts. Each draft now carries platform-
-- specific SEO metadata so the reaction simulator (Phase 9.4) can
-- factor SEO quality into its predictions, and the dashboard can
-- surface "이 콘텐츠는 X에서는 SEO 점수 78점, 네이버 블로그에서는
-- 42점" comparison per platform.
--
-- SEO matters differently per platform:
--   • X/Twitter:        hashtag count + first-line keyword
--   • Instagram:        hashtags 8-15 + alt text + first 125 chars
--   • TikTok:           keywords in description + sound/effect tags
--   • YouTube:          title + description + tags (extensive)
--   • Naver 블로그:       H1 + 본문 keyword density + 메타 desc
--   • Naver 스마트스토어:  상품명 keyword + 카테고리 + 태그
--   • Reddit:           title weight (very high) + subreddit fit
--   • LinkedIn:         title + body + skills hashtags

alter table public.mrai_content_drafts
  add column if not exists seo_title text,                       -- short SEO-optimized title
  add column if not exists seo_description text,                 -- meta description / first paragraph
  add column if not exists seo_keywords text[]                   -- primary keywords (3-7)
    default '{}'::text[],
  -- Platform-specific extras. Examples:
  --   naver_blog:     { category, h2s: [...], internal_links: [...] }
  --   youtube:        { thumbnail_text, end_screen_links: [...] }
  --   instagram:      { alt_text, location_tag }
  --   naver_smartstore: { product_category_code, brand_tag }
  add column if not exists seo_meta jsonb not null default '{}'::jsonb,
  -- AI-graded SEO score (0-100) per the platform's rules. Filled by
  -- the SEO scoring agent (Phase 2). Cached so the dashboard doesn't
  -- re-call the LLM on every render.
  add column if not exists seo_score integer
    check (seo_score is null or (seo_score >= 0 and seo_score <= 100)),
  -- AI-generated improvement notes alongside the score
  add column if not exists seo_notes jsonb not null default '[]'::jsonb,
  -- When the SEO scorer last evaluated this draft
  add column if not exists seo_scored_at timestamptz;

-- Index for "show me drafts with low SEO score on this platform"
create index if not exists mrai_content_drafts_seo_score_idx
  on public.mrai_content_drafts (workspace_id, seo_score)
  where seo_score is not null;
