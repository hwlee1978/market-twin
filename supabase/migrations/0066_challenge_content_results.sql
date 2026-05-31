-- Task 2 마케팅 콘텐츠 생성 결과 영구 저장.
--
-- /sme-strategy/content 페이지에서 생성한 시장분석 리포트 + 다국어
-- 기술서 + 공공데이터 grounding + Humanize 결과를 input_hash 키로
-- 영구 보관. 페이지 새로고침·재방문 시 동일 입력 → 캐시된 결과 즉시
-- 복원. URL ?hash=… 형태로 공유 가능.
--
-- ch_recommendations와 같은 패턴 (input_hash + workspace_id 인덱스).

create table if not exists public.ch_content_results (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid references public.workspaces(id) on delete cascade,
  -- Input snapshot (재현성 키 + 복원용)
  input_hash          text not null,            -- SHA-256 of {company, product, goal, recommendations[]}
  input_company       jsonb,                    -- {name, industry, region, ...}
  input_product       jsonb,                    -- {name, category, description}
  input_goal          text,
  input_price_krw     integer,                  -- 사용자가 입력한 정가 (없으면 null)
  input_image_url     text,                     -- 사용자가 입력한 이미지 URL
  -- 생성 결과
  report              jsonb,                    -- MarketReport (executive_summary, signals, grounding, humanize_meta)
  spec                jsonb,                    -- MultilingualSpec (5 locales + detail_page + humanize_meta)
  -- Provenance
  generated_at        timestamptz not null default now(),
  cost_usd_total      numeric(8,4),             -- report + spec + humanize 비용 합계
  generation_ms_total integer
);
create index if not exists ch_content_results_ws_idx on public.ch_content_results (workspace_id);
create index if not exists ch_content_results_hash_idx on public.ch_content_results (input_hash);
create index if not exists ch_content_results_generated_at_idx on public.ch_content_results (generated_at desc);

-- RLS — 워크스페이스 멤버만 본인 콘텐츠 읽기. 작성은 service role.
alter table public.ch_content_results enable row level security;

drop policy if exists ch_content_results_ws_read on public.ch_content_results;
create policy ch_content_results_ws_read on public.ch_content_results
  for select using (
    workspace_id in (
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
  );
