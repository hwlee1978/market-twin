# Billing 가동 — User-Side 작업 가이드 (Toss 단독)

**작성일:** 2026-06-05
**대상:** Market Twin (markettwin.ai) 운영자
**전제:** dev-side code 완료 (commits `36de941`, `cd67372`). USD 결제 (Stripe Korea / Atlas LLC / Paddle MoR) 는 paid pilot 검증 후 추가 검토 — 지금은 **Toss 단독** 으로 한국 KRW 결제만 가동합니다.

**가동 후 사용 도구:** `https://markettwin.ai/ko/admin/billing` 의 readiness 패널 — env var 상태 + 체크리스트 실시간 표시. Stripe 그룹은 "보류" (warning) 로 표시되며 overall readiness 를 막지 않습니다.

---

## 0. 사전 준비 (1회)

### 0.1 사업자등록·통신판매업 신고 확인
- ㈜미스터에이아이 사업자번호 693-87-03907 ✓
- 통신판매업 신고 제2026-용인수지-2253호 (2026-05-28 완료) ✓
- 두 정보는 Toss 가맹점 가입 시 입력. 사업자 등록증 + 통신판매업 신고증 PDF 미리 준비.

### 0.2 가격 정책 확정
[src/lib/billing/plans.ts](../src/lib/billing/plans.ts) 기준 (코드 = 단일 출처):

| 플랜 | 월간 KRW | 연간 KRW (월×10, 17% off) |
|---|---|---|
| Starter | ₩500,000 | ₩5,000,000 |
| Validator | ₩1,500,000 | ₩15,000,000 |
| Growth | ₩3,500,000 | ₩35,000,000 |

USD 가격은 코드에 함께 정의돼 있지만 Stripe 미가동 상태에서 USD 결제는 동작 안 함. /plans 페이지에서 KRW 가격만 표시·결제 가능합니다.

---

## 1. Toss Payments 세팅 (KRW 결제 경로)

### 1.1 가맹점 가입
- https://www.tosspayments.com/signup
- 사업자번호 693-87-03907 입력
- 사업자 등록증·통신판매업 신고증 업로드
- 정산 계좌 등록 (KRW 정산)
- **심사 1-3 영업일** — 통과 후 콘솔 접근 가능

### 1.2 API 키 발급

Toss Payments 콘솔 → **개발 정보** → **API 키**

- **테스트 키** 부터 사용. 운영 키는 모든 테스트 통과 후 전환.
- 두 종류 키 표시:
  - **Client Key** (`test_ck_...` / `live_ck_...`) — 브라우저 노출 OK
  - **Secret Key** (`test_sk_...` / `live_sk_...`) — 서버 only

```
TOSS_SECRET_KEY = test_sk_...
NEXT_PUBLIC_TOSS_CLIENT_KEY = test_ck_...
```

### 1.3 빌링 키 발급 (자동결제 활성화)

콘솔 → **결제 모듈** → **빌링** → **빌링 키 발급 신청**.
- 정기 자동결제용 빌링 키 — 신청 후 1-2영업일.
- SaaS 구독 모델은 빌링 키 필수 (없으면 일회성 결제만 가능).

### 1.4 Webhook 등록

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

### 1.5 (선택) 세금계산서 자동 발행 설정

B2B 구매팀 대응용. 콘솔 → **부가 기능** → **세금계산서 자동 발행** 활성화.
- Validator/Growth plan 가입 시 자동 세금계산서 발행
- 한국 부가세 신고 시 매출 자료 자동 정리

---

## 2. Vercel 환경변수 입력

Vercel Dashboard → 프로젝트 → **Settings** → **Environment Variables**

### 2.1 Production env에 3개 추가

| Key | Value | 환경 |
|---|---|---|
| `TOSS_SECRET_KEY` | `live_sk_...` (또는 `test_sk_…` for staging) | Production + Preview |
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` | `live_ck_...` | All envs |
| `TOSS_WEBHOOK_SECRET` | (Toss 콘솔에서 받은 secret) | Production + Preview |

### 2.2 가동 스위치

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SIGNUP_ENABLED` | `true` |

이 변수가 `true` 이전에는 `/signup` 페이지가 "Coming Soon" 으로 표시됨. 위 Toss 항목 ✓ 확인 후 마지막에 설정.

### 2.3 Stripe env는 비워 둠

`STRIPE_*` 변수들은 모두 unset 상태로 둡니다. admin/billing readiness 패널이 Stripe 그룹을 "보류 (warning)" 로 표시하고 overall readiness 를 막지 않습니다.

### 2.4 Redeploy

env 변경 후 Vercel은 새 배포 필요. **Deployments** → 최근 배포 옆 메뉴 → **Redeploy** (또는 `git push` 로 트리거).

---

## 3. 가동 확인 (Test mode)

### 3.1 admin/billing readiness 패널 확인

https://markettwin.ai/ko/admin/billing → 페이지 상단 readiness 패널

- **Toss 그룹** — 모든 항목 ✓ 인지 확인
- **Signup 그룹** — `NEXT_PUBLIC_SIGNUP_ENABLED=true` 확인
- **Stripe 그룹** — ⚠ 표시 정상 (deferred 상태, 가동 막지 않음)
- **Overall** — ⚠ Some warnings (Stripe 보류 때문). Toss + Signup 만으로 결제 흐름은 정상 작동.

### 3.2 Test 결제 1회 (Toss test mode)

1. 익명·테스트 계정으로 https://markettwin.ai/ko/signup → 신규 가입
2. /plans → Starter (KRW 가격 표시) 클릭 → checkout
3. Toss test 결제 흐름 — Toss 가이드의 test card 사용
4. 결제 완료 → workspace 의 subscription.plan = "starter" 로 flip 확인 (/admin/customers)
5. Toss 콘솔 → 결제 이력 → 정상 수신 + webhook 전달 확인

### 3.3 환불 / 해지 flow 1회

1. 활성 구독에서 사용자 페이지 → 해지
2. 해지 후 immediate revoke vs 다음 결제일까지 사용 - 정책 확인
3. 한국 전자상거래법은 자동결제 해지 절차가 가입 절차와 동일 단계여야 함 (현재 code 충족)

---

## 4. Test → Production 전환

모든 test 시나리오 통과 후:

1. **Toss**: 콘솔 → 운영 모드 활성화 신청. 운영 키 발급.
2. **Vercel env**: 3개 변수 (`TOSS_SECRET_KEY` / `NEXT_PUBLIC_TOSS_CLIENT_KEY` / `TOSS_WEBHOOK_SECRET`) 를 live 값으로 교체. Redeploy.
3. **admin/billing readiness** 재확인 — Toss + Signup 모두 ✓.
4. `NEXT_PUBLIC_SIGNUP_ENABLED=true` (이미 설정돼 있으면 그대로).
5. **공식 가동.**

---

## 5. 가동 후 모니터링

### 5.1 일일 체크

- https://markettwin.ai/ko/admin/billing → 비용 KPI (이번 달 spend / wasted spend / sim count)
- Toss 콘솔 → 결제 이력
- Vercel → Functions → /api/billing/toss/webhook 에러 0인지

### 5.2 주간 체크

- /admin/health → 실패율 < 10% 유지
- /admin/customers → MRR 트렌드 + 해지율
- Toss 콘솔 → 정기결제 실패 (BILLING_PAYMENT_FAILED) 모니터링

### 5.3 월간 체크

- 한국 부가세 신고 자료 준비 (Toss 세금계산서 자동 발행 활용)
- 통신판매업 신고 갱신 일정
- Toss 정산 vs admin/billing 비용 reconcile

---

## 6. USD 결제 추가 검토 (paid pilot 검증 후)

paid pilot 후 해외 사용자 발견 시 다음 옵션 비교:

| 옵션 | 가입 난이도 | 수수료 | 비고 |
|---|---|---|---|
| Stripe Korea 직접 | 중 (검수 5-15일) | 2.9-3.6% | Korea 법인 직접, 일부 제한 가능 |
| Stripe Atlas + US LLC | 고 (US entity) | 2.9-3.6% | 글로벌 확장 최강, 회계 복잡도 ↑ |
| Paddle (MoR) | 저 (최단) | ~5% | 모든 세무·환불 위탁, code 통합 ~반나절 |

추가 시점에 다시 결정. 그 때까지 코드의 Stripe 라우팅은 dormant 유지 (env unset → checkout 500 명확 에러).

---

## 7. Troubleshooting

### "Toss webhook 수신 안 됨"
- 콘솔 → 웹훅 → Recent deliveries 에서 4xx/5xx 응답 확인
- Vercel logs → /api/billing/toss/webhook 에러 메시지 확인
- TOSS_WEBHOOK_SECRET env var 일치 확인

### "Test mode 결제는 됐는데 production 안 됨"
- Vercel env 의 `TOSS_SECRET_KEY` / `NEXT_PUBLIC_TOSS_CLIENT_KEY` 모두 live 값인지
- Toss 콘솔 → 운영 모드 활성화 확인
- Webhook URL이 production 도메인인지 (`markettwin.ai` 아닌 staging 이면 fail)

### "Toss 빌링 키 발급 지연"
- Toss 심사 통상 1-3영업일. 5일 넘으면 콘솔 → 1:1 문의
- 빌링 키 없으면 일회성 결제만 가능, 자동결제 cron 실패

### "공휴일·새벽에 자동결제 실패"
- 사용자 카드사 정책. Toss dunning 규칙 콘솔에서 설정.
- 실패 시 사용자 이메일 알림 (BILLING_PAYMENT_FAILED 웹훅 핸들러 동작)

### "/plans 페이지에 USD 가격이 보임"
- 정상 — 코드의 `plans.ts` 에 USD 가격 정의 있음
- Stripe 미가동이라 USD 결제 버튼 누르면 500 에러 (의도된 동작)
- USD 표시 자체를 hide하고 싶으면 `/src/lib/billing/plans.ts` 의 priceMonthly.usd 를 null 로 변경 + 표시 logic 조건 추가 (선택)

---

## 8. 보안 + 컴플라이언스 reminders

- **Toss 키는 Vercel env 외 어디에도 저장 금지** — Git, Slack, Notion 모두 NO
- `.env.local` 에 live_sk_… 적어두는 경우 .gitignore 확인. 누출 시 즉시 rotate.
- 통신판매업 신고증·사업자등록증 PDF는 회사 클라우드 (Google Drive) 권한 제한 폴더에 보관
- 정기 결제 7일 사전 안내 cron (`/api/billing/trial-reminder`) 가 매일 09 UTC 실행됨 — Vercel Crons 페이지에서 상태 모니터링

---

## 9. 참조 코드 경로

dev-side가 어디서 무엇을 하는지:

- `src/lib/billing/plans.ts` — plan 정의 (가격, 한도)
- `src/lib/billing/readiness.ts` — env 상태 check (admin 표시용; Stripe deferred 자동 인식)
- `src/app/api/billing/toss/issue/route.ts` — Toss 빌링 키 발급 시작
- `src/app/api/billing/toss/webhook/route.ts` — Toss webhook handler
- `src/app/api/billing/toss/cancel/route.ts` — Toss 해지
- `src/app/api/billing/toss/renew/route.ts` — 정기 결제 갱신 cron
- `src/app/api/billing/trial-reminder/route.ts` — 7일 사전 안내 cron
- `src/components/billing/BillingComplianceNotice.tsx` — 결제 화면 컴플라이언스 표시

---

**가동 완료 후:** /admin/billing 의 readiness 패널이 Toss + Signup 모두 ✓ + Stripe 보류 (warning) 상태 + /signup 가 정상 작동하면 user-side 작업 종료. USD 결제 추가는 paid pilot 데이터로 결정.

*작성: Mr.AI (Claude Opus 4.7) — 2026-06-05*
