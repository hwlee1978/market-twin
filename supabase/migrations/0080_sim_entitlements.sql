-- 0080_sim_entitlements.sql
--
-- 단건 이용권(1회권) = "1회 시뮬 실행 권한". 구독 플랜/월 할당량과 무관하게,
-- 구매 1건당 특정 티어(hypothesis/decision/decision_plus/deep) 시뮬을 1회
-- 실행할 수 있는 소비형 entitlement.
--
-- 흐름: NICE 결제창 단건결제 승인(return 라우트) → active 행 1개 insert →
-- run-ensemble가 플랜 게이트에 막힐 때 같은 티어의 active 권한이 있으면 실행을
-- 허용하고 ensemble 생성 후 consumed로 원자적 소비.

create table if not exists public.sim_entitlements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tier text not null check (tier in ('hypothesis', 'decision', 'decision_plus', 'deep', 'deep_pro')),
  -- 어떤 단건결제가 부여했는지(감사/환불 추적). nice_pending_orders.order_id.
  order_id text references public.nice_pending_orders(order_id),
  status text not null default 'active' check (status in ('active', 'consumed')),
  consumed_ensemble_id uuid references public.ensembles(id) on delete set null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

comment on table public.sim_entitlements is
  '단건 이용권 = 1회 시뮬 실행 권한(소비형). 구독 할당량과 별개로 티어별 1회 실행을 부여/소비.';

-- run-ensemble 소비 조회: (workspace, tier, status='active')를 가장 오래된 것부터.
create index if not exists sim_entitlements_active_idx
  on public.sim_entitlements (workspace_id, tier, status, created_at);

alter table public.sim_entitlements enable row level security;
-- 서비스롤(서버)만 접근. 클라이언트 직접 접근 없음 → 정책 미부여.

-- pending_orders.cycle에 단건 이용권 표식('single')을 허용하도록 체크 완화.
-- (구독은 monthly/annual, 단건 이용권은 single로 적재해 return 라우트가 분기.)
alter table public.nice_pending_orders drop constraint if exists nice_pending_orders_cycle_check;
alter table public.nice_pending_orders
  add constraint nice_pending_orders_cycle_check check (cycle in ('monthly', 'annual', 'single'));
