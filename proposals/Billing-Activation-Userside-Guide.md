# Billing 가동 — User-Side 작업 가이드

**작성일:** 2026-06-05
**대상:** Market Twin (markettwin.ai) 운영자
**전제:** dev-side code 완료 (commits `36de941`, `cd67372`). 이 가이드는 user가 Stripe/Toss/Vercel 대시보드에서 해야 할 액션만 다룹니다.

**가동 후 사용 도구:** `https://markettwin.ai/ko/admin/billing` 의 readiness 패널 — env var 상태 + 체크리스트 실시간 표시. 작업 중 이 페이지를 옆에 띄워 두고 항목별로 ✗ → ✓ 만들면 됩니다.

---

## 0. 사전 준비 (1회)

### 0.1 사업자등록·통신판매업 신고 확인
- ㈜미스터에이아이 사업자번호 693-87-03907 ✓
- 통신판매업 신고 제2026-용인수지-2253호 (2026-05-28 완료) ✓
- 두 정보는 Stripe·Toss 가입 시 모두 입력. KOR 사업자 등록증 + 통신판매업 신고증 PDF 미리 준비.

### 0.2 가격 정책 확정
[src/lib/billing/plans.ts](../src/lib/billing/plans.ts) 기준 (코드 = 단일 출처):

| 플랜 | 월간 USD | 월간 KRW | 연간 USD (월×10, 17% off) | 연간 KRW |
|---|---|---|---|---|
| Starter | $399 | ₩500,000 | $3,990 | ₩5,000,000 |
| Validator | $999 | ₩1,500,000 | $9,990 | ₩15,000,000 |
| Growth | $2,299 | ₩3,500,000 | $22,990 | ₩35,000,000 |

가격 변경 시 코드 + Stripe + Toss 동시 업데이트 필요 — **3곳이 분리되면 결제 시 오류 발생**.

---

## 1. Stripe 세팅 (USD 결제 경로)

### 1.1 Stripe 가입
- https://dashboard.stripe.com/register
- Country: South Korea
- 사업자 정보 입력 (사업자번호 + 통신판매업 신고증)
- **Test mode** 로 먼저 시작 (왼쪽 상단 toggle). Production은 모든 흐름 검증 후 전환.

### 1.2 3 Product 생성

각 plan마다 product 하나씩 (총 3개). Stripe Dashboard → **Products** → **+ Add product**.

#### Product 1: Starter
- **Name:** Market Twin — Starter
- **Description:** 월 5회 Consensus 시뮬, 1 seat (Optional 입력)
- **Pricing — Recurring:**
  - **Monthly:** $399.00 USD, 매월 (Currency 추가시 ₩500,000 KRW 도 함께)
  - 'Add another price' → **Annual:** $3,990.00 USD, 매년
- Save

#### Product 2: Validator
- **Name:** Market Twin — Validator
- **Pricing:**
  - Monthly: $999.00 USD
  - Annual: $9,990.00 USD

#### Product 3: Growth
- **Name:** Market Twin — Growth
- **Pricing:**
  - Monthly: $2,299.00 USD
  - Annual: $22,990.00 USD

### 1.3 Price ID 복사

각 price를 클릭하면 `price_1Nxxxx...` 형식의 Price ID가 표시됨. 6개를 모두 메모장에 복사:

```
STRIPE_PRICE_STARTER_MONTHLY = price_1Nxxx...
STRIPE_PRICE_STARTER_ANNUAL = price_1Nxxx...
STRIPE_PRICE_VALIDATOR_MONTHLY = price_1Nxxx...
STRIPE_PRICE_VALIDATOR_ANNUAL = price_1Nxxx...
STRIPE_PRICE_GROWTH_MONTHLY = price_1Nxxx...
STRIPE_PRICE_GROWTH_ANNUAL = price_1Nxxx...
```

### 1.4 Webhook 등록

Stripe Dashboard → **Developers** → **Webhooks** → **+ Add endpoint**

- **Endpoint URL:** `https://markettwin.ai/api/billing/webhook`
- **Description:** Market Twin subscription events
- **Events to send (Select events 클릭):**
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
- **Add endpoint** 클릭
- 생성된 webhook 페이지에서 **Signing secret** (`whsec_...`) 표시 → 클릭하여 복사

```
STRIPE_WEBHOOK_SECRET = whsec_...
```

### 1.5 Account Keys 복사

Stripe Dashboard → **Developers** → **API keys**

- **Secret key:** `sk_test_...` (test mode) 또는 `sk_live_...` (production)
- Test → Production 전환 시 두 키 모두 교체 필요

```
STRIPE_SECRET_KEY = sk_test_...   # production은 sk_live_...
```

---

## 2. Toss Payments 세팅 (KRW 결제 경로)

### 2.1 가맹점 가입
- https://www.tosspayments.com/signup
- 사업자번호 693-87-03907 입력
- 사업자 등록증·통신판매업 신고증 업로드
- 정산 계좌 등록 (KRW 정산)
- **심사 1-3 영업일** — 통과 후 콘솔 접근 가능

### 2.2 API 키 발급

Toss Payments 콘솔 → **개발 정보** → **API 키**

- **테스트 키** 부터 사용. 운영 키는 모든 테스트 통과 후 전환.
- 두 종류 키 표시:
  - **Client Key** (`test_ck_...` / `live_ck_...`) — 브라우저 노출 OK
  - **Secret Key** (`test_sk_...` / `live_sk_...`) — 서버 only

```
TOSS_SECRET_KEY = test_sk_...
NEXT_PUBLIC_TOSS_CLIENT_KEY = test_ck_...
```

### 2.3 빌링 키 발급 (자동결제 활성화)

콘솔 → **결제 모듈** → **빌링** → **빌링 키 발급 신청**.
- 정기 자동결제용 빌링 키 — 신청 후 1-2영업일.

### 2.4 Webhook 등록

콘솔 → **개발 정보** → **웹훅 설정**

- **URL:** `https://markettwin.ai/api/billing/toss/webhook`
- **이벤트:**
  - 결제 완료 (`PAYMENT_STATUS_CHANGED` → `DONE`)
  - 결제 취소 (`PAYMENT_STATUS_CHANGED` → `CANCELED`)
  - 정기결제 갱신 (`BILLING_PAYMENT`)
  - 정기결제 실패 (`BILLING_PAYMENT_FAILED`)

- **시크릿 키 생성** 클릭 → 표시되는 시크릿 복사:

```
TOSS_WEBHOOK_SECRET = <표시된 secret>
```

---

## 3. Vercel 환경변수 입력

Vercel Dashboard → 프로젝트 → **Settings** → **Environment Variables**

### 3.1 Production env에 11개 추가

| Key | Value | 환경 |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` (또는 sk_test_… for staging) | Production + Preview |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Production + Preview |
| `STRIPE_PRICE_STARTER_MONTHLY` | `price_...` | All envs |
| `STRIPE_PRICE_STARTER_ANNUAL` | `price_...` | All envs |
| `STRIPE_PRICE_VALIDATOR_MONTHLY` | `price_...` | All envs |
| `STRIPE_PRICE_VALIDATOR_ANNUAL` | `price_...` | All envs |
| `STRIPE_PRICE_GROWTH_MONTHLY` | `price_...` | All envs |
| `STRIPE_PRICE_GROWTH_ANNUAL` | `price_...` | All envs |
| `TOSS_SECRET_KEY` | `live_sk_...` | Production + Preview |
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` | `live_ck_...` | All envs |
| `TOSS_WEBHOOK_SECRET` | (Toss 콘솔에서 받은 secret) | Production + Preview |

### 3.2 가동 스위치

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SIGNUP_ENABLED` | `true` |

이 변수가 `true` 이전에는 `/signup` 페이지가 "Coming Soon" 으로 표시됨. 모든 위 항목 ✓ 확인 후 마지막에 설정.

### 3.3 Redeploy

env 변경 후 Vercel은 새 배포 필요. **Deployments** → 최근 배포 옆 메뉴 → **Redeploy** (또는 `git push` 로 트리거).

---

## 4. 가동 확인 (Test mode)

### 4.1 admin/billing readiness 패널 확인

https://markettwin.ai/ko/admin/billing → 페이지 상단 readiness 패널

- 모든 항목 ✓ 인지 확인
- ✗ 있으면 해당 env var 다시 점검 (Vercel 입력 누락 or redeploy 안 됨)

### 4.2 Test 결제 1회 (Stripe test mode)

1. 익명·테스트 계정으로 https://markettwin.ai/ko/signup → 신규 가입
2. /plans → Starter 클릭 → checkout
3. Stripe test card: `4242 4242 4242 4242`, 만료 임의 미래일, CVC 임의 3자리
4. 결제 완료 → workspace 의 subscription.plan = "starter" 로 flip 확인 (admin/customers 페이지)
5. Stripe Dashboard → Events → `checkout.session.completed` 이벤트 정상 수신 확인

### 4.3 Test 결제 1회 (Toss test mode)

1. /plans?cycle=monthly → Starter (KRW 가격 표시)
2. Toss test 결제 흐름 — 카드 `4330 1234 1234 1234` (Toss 가이드의 test card)
3. webhook 수신 + subscription flip 확인

### 4.4 환불 / 해지 flow 1회

1. 활성 구독에서 /admin/billing 또는 사용자 페이지 → 해지
2. 즉시 해지 vs 다음 결제일까지 사용 — Stripe/Toss 정책에 따라 다름. 두 시나리오 모두 1회씩 테스트.

---

## 5. Test → Production 전환

모든 test 시나리오 통과 후:

1. **Stripe**: Dashboard 좌측 상단 toggle → Live mode. 동일한 3 product + 6 price + webhook 재생성 (test 데이터는 별도). Live key 복사.
2. **Toss**: 콘솔 → 운영 모드 활성화 신청. 운영 키 발급.
3. **Vercel env**: `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `TOSS_SECRET_KEY` / `NEXT_PUBLIC_TOSS_CLIENT_KEY` / `TOSS_WEBHOOK_SECRET` 5개를 live 값으로 교체. Price IDs는 production product의 신규 ID로 교체. Redeploy.
4. **admin/billing readiness** 재확인 — 모든 ✓.
5. `NEXT_PUBLIC_SIGNUP_ENABLED=true` (이미 설정돼 있으면 그대로).
6. **공식 가동.**

---

## 6. 가동 후 모니터링

### 6.1 일일 체크

- https://markettwin.ai/ko/admin/billing → 비용 KPI (이번 달 spend / wasted spend / sim count)
- Stripe Dashboard → Recent payments
- Toss 콘솔 → 결제 이력
- Vercel → Functions → /api/billing/webhook 에러 0인지

### 6.2 주간 체크

- /admin/health → 실패율 < 10% 유지
- /admin/customers → MRR 트렌드 + 해지율
- Stripe 의 자동 환불 / 분쟁 (Disputes) 알림

### 6.3 월간 체크

- 한국 부가세 신고 자료 준비 (Stripe Tax 또는 별도 회계)
- 통신판매업 신고 갱신 일정
- Stripe + Toss 정산 vs admin/billing 비용 reconcile

---

## 7. Troubleshooting (자주 막히는 곳)

### "결제 후에도 subscription.plan 이 free_trial 그대로"
- Webhook endpoint URL 오타 확인
- Stripe → Webhooks → Recent deliveries 에서 4xx/5xx 응답 확인
- Vercel logs → /api/billing/webhook 에러 메시지 확인

### "STRIPE_PRICE_<PLAN>_<CYCLE> env var is missing or invalid"
- Vercel env에 정확히 8개 입력됐는지 (위 §3.1 표)
- Price ID 복사 시 양쪽 공백 제거
- Redeploy 했는지

### "Test mode 결제는 됐는데 production은 안 됨"
- Live mode 의 Product/Price 별도 생성했는지
- Webhook도 Live mode 에 별도 등록했는지
- Vercel env 의 secret key + webhook secret 모두 live 값인지

### "Toss 빌링 키 발급 지연"
- Toss 심사 통상 1-3영업일. 5일 넘으면 콘솔 → 1:1 문의
- 빌링 키 없으면 일회성 결제만 가능, 자동결제 cron 실패

### "공휴일·새벽에 자동결제 실패"
- 사용자 카드사 정책. Stripe Smart Retries 기본 ON 권장.
- Toss는 별도 dunning 정책 — 콘솔에서 재시도 규칙 설정.

---

## 8. 보안 + 컴플라이언스 reminders

- **Stripe/Toss 키는 Vercel env 외 어디에도 저장 금지** — Git, Slack, Notion 모두 NO
- `.env.local` 에 sk_live_… 적어두는 경우 .gitignore 확인. 누출 시 즉시 rotate.
- 통신판매업 신고증·사업자등록증 PDF는 회사 클라우드 (Google Drive) 권한 제한 폴더에 보관
- 정기 결제 7일 사전 안내 cron (`/api/billing/trial-reminder`) 가 매일 09 UTC 실행됨 — Vercel Crons 페이지에서 상태 모니터링

---

## 9. 참조 코드 경로

dev-side가 어디서 무엇을 하는지:

- `src/lib/billing/plans.ts` — plan 정의 (가격, 한도)
- `src/lib/billing/stripe.ts` — Stripe client + price ID resolver
- `src/lib/billing/readiness.ts` — env 상태 check (admin 표시용)
- `src/app/api/billing/checkout/route.ts` — Stripe checkout session 생성
- `src/app/api/billing/webhook/route.ts` — Stripe webhook handler
- `src/app/api/billing/toss/issue/route.ts` — Toss 빌링 키 발급 시작
- `src/app/api/billing/toss/webhook/route.ts` — Toss webhook handler
- `src/app/api/billing/toss/cancel/route.ts` — Toss 해지
- `src/app/api/billing/trial-reminder/route.ts` — 7일 사전 안내 cron

---

**가동 완료 후:** /admin/billing 의 readiness 패널이 모든 ✓ 표시 + /signup 가 정상 작동하면 user-side 작업 종료. 이후 코드 변경이 필요하면 dev-side 작업.

*작성: Mr.AI (Claude Opus 4.7) — 2026-06-05*
