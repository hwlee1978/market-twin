-- Long-running 영상 생성 job 추적.
--
-- 기존 동기 방식 (POST가 6-8분 polling 후 응답)은 브라우저/edge proxy의
-- connection idle timeout (보통 60-300s) 으로 인해 "Failed to fetch"
-- 발생. 서버는 200으로 완료해도 클라이언트는 결과 못 받음.
--
-- 해결 방안: POST가 Replicate prediction 생성만 하고 즉시 job_id 반환
-- → 클라이언트는 GET /status?id=… 로 5초마다 polling. 각 요청이 짧아
-- proxy timeout 회피. 완료 시 영상 URL 반환.

create table if not exists public.ch_video_jobs (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid references public.workspaces(id) on delete cascade,
  -- 생성 옵션
  tier                text not null check (tier in ('A', 'B', 'C')),
  duration            integer not null check (duration in (5, 10)),
  aspect_ratio        text not null check (aspect_ratio in ('16:9', '9:16', '1:1')),
  -- 입력
  image_url           text not null,
  product_name        text,
  product_category    text,
  -- Replicate predictions (per scene)
  -- [{prediction_id, scene, motion_prompt, status, video_url?}]
  predictions         jsonb not null default '[]'::jsonb,
  -- Tier C voiceover (TTS sync 생성이라 즉시 채워짐)
  voiceover_url       text,
  voiceover_cost_usd  numeric(8,4),
  -- 메타
  status              text not null default 'pending' check (
    status in ('pending', 'running', 'succeeded', 'failed', 'partial')
  ),
  created_at          timestamptz not null default now(),
  completed_at        timestamptz,
  total_cost_usd      numeric(8,4),
  error               text
);
create index if not exists ch_video_jobs_ws_idx on public.ch_video_jobs (workspace_id);
create index if not exists ch_video_jobs_status_idx on public.ch_video_jobs (status);
create index if not exists ch_video_jobs_created_at_idx on public.ch_video_jobs (created_at desc);

alter table public.ch_video_jobs enable row level security;

-- 인증 사용자: 본인 워크스페이스 job 읽기
drop policy if exists ch_video_jobs_ws_read on public.ch_video_jobs;
create policy ch_video_jobs_ws_read on public.ch_video_jobs
  for select using (
    workspace_id in (
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
  );
