-- ch_video_jobs duration check constraint 확장 (5, 10 → 4, 5, 8, 10).
-- Seedance 2.0 i2v 는 4 / 8 (default) / 10 초 지원. Kling 시절 5/10
-- 만 허용했던 constraint 가 8 초 영상 INSERT 거부.

alter table public.ch_video_jobs
  drop constraint if exists ch_video_jobs_duration_check;

alter table public.ch_video_jobs
  add constraint ch_video_jobs_duration_check
  check (duration in (4, 5, 8, 10));
