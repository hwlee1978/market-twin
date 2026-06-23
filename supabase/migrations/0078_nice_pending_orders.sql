-- 0078_nice_pending_orders.sql
--
-- 나이스페이먼츠(V2) 결제창 단건결제용 pending order 매핑.
--
-- 결제창(SDK) 흐름은 인증 완료 후 NICE가 returnUrl로 cross-site POST를
-- 보낸다. 이 POST에는 우리 세션 쿠키가 실리지 않으므로(SameSite), orderId
-- 만으로 "누구의 / 어떤 플랜 / 얼마" 결제인지 역추적할 수 있어야 한다.
-- 결제창을 띄우기 직전(인증된 요청)에 이 테이블에 매핑을 적재하고, return
-- 라우트가 orderId로 조회해 승인·권한부여한다. amount는 위변조 방지를 위해
-- 여기 저장값과 NICE가 돌려준 서명된 amount를 대조한다.
--
-- 단건결제는 빌키(bid)가 없다 — subscriptions.nice_bid는 null로 두고,
-- current_period_end로 1개월/1년 접근을 부여한다(자동갱신 없음, 만료 sweep은
-- /api/billing/nice/renew가 처리).

create table if not exists public.nice_pending_orders (
  order_id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan text not null,
  cycle text not null check (cycle in ('monthly', 'annual')),
  amount_krw int not null,
  locale text not null default 'ko',
  status text not null default 'pending' check (status in ('pending', 'approved', 'failed')),
  tid text,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

comment on table public.nice_pending_orders is
  '나이스페이먼츠 결제창 단건결제의 orderId↔워크스페이스/플랜/금액 매핑. return 라우트가 cross-site POST에서 세션 없이 결제 맥락을 복원하는 용도.';

-- return 라우트는 항상 order_id(pk)로 조회하므로 별도 인덱스 불필요.
-- 워크스페이스별 정리/조회용 보조 인덱스만 둔다.
create index if not exists nice_pending_orders_workspace_idx
  on public.nice_pending_orders (workspace_id, created_at desc);

alter table public.nice_pending_orders enable row level security;
-- 서비스롤(서버)만 접근. 클라이언트 직접 접근 없음 → select 정책 미부여.
