-- 0077_nice_billing.sql
--
-- 나이스페이먼츠 (NICE Payments) V2 신모듈 정기결제 연동.
-- Toss → NICE 전환: 토스 빌링키(toss_billing_key)에 대응하는 NICE
-- 빌키(bid)를 저장할 컬럼을 추가한다. payment_provider는 text 컬럼이라
-- enum 제약이 없어 'nicepay' 값을 그대로 허용한다(앱 코드에서만 분기).
--
-- NICE는 토스의 customerKey 개념이 없다 — bid 자체가 카드 매핑 키이고,
-- 결제마다 unique orderId만 새로 생성한다. 따라서 nice_customer_key는
-- 추가하지 않는다.

alter table public.subscriptions
  add column if not exists nice_bid text; -- NICE V2 빌키(bid). provider=nicepay일 때 정기결제에 사용.

comment on column public.subscriptions.nice_bid is
  '나이스페이먼츠 V2 빌키(bid). payment_provider=''nicepay''일 때 /v1/subscribe/{bid}/payments 정기결제에 사용.';

comment on column public.subscriptions.payment_provider is
  '''stripe'' | ''tosspayments'' | ''nicepay'' — 워크스페이스 업그레이드 시 하나만 설정.';

-- bid 중복 방지(여러 null 공존 허용하는 partial unique).
create unique index if not exists subscriptions_nice_bid_unique
  on public.subscriptions (nice_bid)
  where nice_bid is not null;
