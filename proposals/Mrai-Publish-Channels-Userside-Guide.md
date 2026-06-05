# Mr.AI 채널 publish 가동 — User-Side 작업 가이드

**작성일:** 2026-06-05
**대상:** Market Twin (markettwin.ai) 운영자
**전제:** dev-side **Phase 1** 완료 — OAuth route + publish API + DB schema ready. **UI integration은 Phase 2** (Mr.AI content draft 페이지에 "Connect LinkedIn/X" + "Publish to platform" 버튼 추가, 별도 commit). 본 가이드는 backend 가동을 위한 LinkedIn + X Developer Portal 앱 등록 + env 입력 단계.

Phase 1 가동 후 테스트 방법: 브라우저 직접 access (`/api/mrai/integrations/linkedin/connect` URL) 또는 curl 으로 publish API 호출. Phase 2 commit 시 정식 UI 노출.

---

## 0. 두 플랫폼 비교

| 항목 | LinkedIn | X (Twitter) |
|---|---|---|
| BD 타겟 적합도 | 높음 (KOTRA·중진공·B2B SaaS 결재자) | 보통 (K-startup 커뮤니티) |
| API 비용 | 무료 (Marketing Developer Platform 승인 필요) | Basic $100/월 (tweet write) |
| 승인 기간 | 2-4주 (multi-user posting 시) | 1-7일 (Basic 가입 즉시) |
| 글자 제한 | 3,000 자 | 280 자 (verified 시 더 길게) |
| OAuth | OAuth 2.0 + scope `w_member_social` | OAuth 2.0 + PKCE |

**추천 순서:** LinkedIn 등록 신청 → 승인 기다리는 동안 X 등록 + 결제 → 둘 다 가동.

---

## 1. LinkedIn Developer Portal 등록

### 1.1 앱 생성

1. https://www.linkedin.com/developers/apps 접속 → **Create app**
2. App name: `Market Twin (Mr.AI)`
3. LinkedIn Page: ㈜미스터에이아이 페이지 선택 (없으면 먼저 회사 페이지 생성 — https://www.linkedin.com/company/setup/new)
4. Privacy policy URL: `https://markettwin.ai/privacy`
5. App logo: 회사 로고 업로드
6. Legal agreement 동의 → Create app

### 1.2 OAuth 2.0 설정

App 페이지 → **Auth** 탭:
- Redirect URLs → **Add redirect URL** → `https://markettwin.ai/api/mrai/integrations/linkedin/callback`
- (개발용 추가) `http://localhost:3000/api/mrai/integrations/linkedin/callback`
- OAuth 2.0 scopes에서 다음 4개가 enabled 되어 있는지 확인:
  - `openid` ✓
  - `profile` ✓
  - `email` ✓
  - `w_member_social` ✓ (publish 권한, **승인 필요**)

### 1.3 Products 추가

**Products** 탭 → **Request access**:
- **Sign In with LinkedIn using OpenID Connect** — 즉시 승인 (basic profile)
- **Share on LinkedIn** — w_member_social 포함, **승인 신청 필요**
  - 신청 시 사용 사례: "Market Twin Mr.AI AI agent posts founder's brand expansion announcements / shipping updates / customer case studies to their personal LinkedIn profile based on workspace-stored content drafts" 식으로 명시
  - LinkedIn Marketing Developer Platform 승인 = 2-4주

### 1.4 Client credentials 복사

**Auth** 탭 → **Application credentials** 영역에서:
```
LINKEDIN_CLIENT_ID = (Client ID 복사)
LINKEDIN_CLIENT_SECRET = (Primary Client Secret 복사)
```

⚠ Secret 은 한 번만 표시됨. 즉시 안전한 곳에 저장.

### 1.5 Vercel env 입력

Vercel Dashboard → **Settings** → **Environment Variables**:

| Key | Value | 환경 |
|---|---|---|
| `LINKEDIN_CLIENT_ID` | (1.4 에서 복사) | Production + Preview + Development |
| `LINKEDIN_CLIENT_SECRET` | (1.4 에서 복사) | Production + Preview + Development |
| `APP_BASE_URL` | `https://markettwin.ai` | Production |

(이미 `APP_BASE_URL` 설정돼 있으면 그대로)

### 1.6 Redeploy + 테스트

env 변경 후 redeploy. 그리고:
1. https://markettwin.ai/ko/mrai 에서 "LinkedIn 연결" 클릭
2. LinkedIn 인증 화면 → 권한 동의
3. callback 후 `linkedin=ok` 파라미터로 mrai 페이지로 돌아오면 성공
4. Mr.AI content draft → "Publish to LinkedIn" 버튼 클릭 → LinkedIn 피드 확인

---

## 2. X Developer Portal 등록

### 2.1 개발자 가입 + Basic 결제

1. https://developer.twitter.com/en/portal/dashboard 접속
2. Sign in (Market Twin 운영자 X 계정 사용)
3. **Free tier** 로 시작 → 앱 등록 가능, 그러나 tweet write 안 됨
4. 결제 활성화: **Plan & billing** → **Basic** ($100/월) 가입
5. Basic 가입 후 즉시 tweet write 권한 활성 (별도 승인 대기 없음)

### 2.2 Project + App 생성

1. Dashboard → **+ Create Project**
2. Project name: `Market Twin`, Use case: Building tools for businesses
3. Project 안에 App 자동 생성됨

### 2.3 OAuth 2.0 설정

App 페이지 → **User authentication settings** → **Set up**:
- App permissions: **Read and write** (post 권한 필요)
- Type of App: **Confidential client** (secret 사용)
- Callback URI / Redirect URL:
  - `https://markettwin.ai/api/mrai/integrations/x/callback`
  - `http://localhost:3000/api/mrai/integrations/x/callback` (개발용)
- Website URL: `https://markettwin.ai`
- Organization name: 미스터에이아이
- Organization URL: `https://markettwin.ai`
- Save

### 2.4 Client credentials 복사

App 페이지 → **Keys and tokens**:
- **OAuth 2.0 Client ID and Client Secret** 섹션의 **Regenerate** 클릭 → 표시되는 값 복사
```
X_CLIENT_ID = (OAuth 2.0 Client ID)
X_CLIENT_SECRET = (OAuth 2.0 Client Secret)
```

⚠ Secret 은 한 번만 표시. 즉시 저장.

### 2.5 Vercel env 입력

| Key | Value | 환경 |
|---|---|---|
| `X_CLIENT_ID` | (2.4) | Production + Preview + Development |
| `X_CLIENT_SECRET` | (2.4) | Production + Preview + Development |

### 2.6 Redeploy + 테스트

1. https://markettwin.ai/ko/mrai 에서 "X 연결" 클릭
2. X 인증 화면 → "Authorize app"
3. callback 후 `x=ok` 파라미터로 mrai 페이지로 돌아오면 성공
4. Mr.AI content draft → "Publish to X" 버튼 → 280자 이하 글 등록 → X 타임라인 확인

---

## 3. 가동 후 운영

### 3.1 publish 이력 확인

DB의 `mrai_publish_posts` 테이블 또는 `/admin/outcomes` 같은 admin 페이지에서:
- `status`: pending / sent / failed
- `platform_post_id` + `platform_url` (sent 시)
- `error_message` (failed 시)

### 3.2 토큰 만료 처리

- **LinkedIn**: access token 60일 → 만료 시 자동 재인증 알림 (refresh token 없음, reconnect 필요)
- **X**: access token 2시간 → refresh token (~6개월 유효) 사용해서 자동 갱신. refresh 실패 시 reconnect 필요.

### 3.3 글자 제한 정책

API publish route 가 platform 별로 자동 검증:
- LinkedIn: 3,000자 이상이면 400 에러
- X: 280자 이상이면 400 에러

Mr.AI content drafter 가 long-form 작성한 경우, 사용자가 X publish 시 명시적으로 짧은 버전 선택해야 함.

---

## 4. Troubleshooting

### "LinkedIn 연결 후 publish 안 됨 — 'not authorized' 에러"
- LinkedIn Marketing Developer Platform 의 `w_member_social` 승인 대기 중일 가능성
- App 페이지 → Products 탭에서 "Share on LinkedIn" 승인 상태 확인
- 승인 완료 후 한 번 재연결 (기존 토큰의 scope 갱신)

### "X publish 시 'Forbidden' 에러"
- Basic 플랜 미가입 (Free tier는 tweet write 불가)
- App permissions 가 'Read and write' 인지 확인
- 280자 초과 (verified 계정 아니면 280자 hard limit)

### "callback 후 'invalid_state' 에러"
- CSRF state 검증 실패. 보통 동일 브라우저에서 다른 탭으로 인증 시도하면 발생
- 같은 탭에서 처음부터 다시 시도

### "Vercel env 추가했는데 인식 안 됨"
- Redeploy 필요
- env 추가 후 Deployments → 최근 배포 → Redeploy

---

## 5. 보안 + 컴플라이언스

- **Client secret 은 Vercel env 외 어디에도 저장 금지**
- LinkedIn 의 Personal API Posting Guidelines 준수 (스팸성 자동 게시 금지, 1일 N개 한도)
- X 의 Automation Rules 준수 (동일 내용 반복 게시 금지)
- Mr.AI 가 작성한 content draft 가 LinkedIn/X 정책 위반 가능성 있을 시 사용자가 수동 publish 트리거 (현재 architecture)

---

## 6. 참조 코드 경로

- `src/lib/mrai/integrations/linkedin.ts` — OAuth + publish helpers
- `src/lib/mrai/integrations/x.ts` — OAuth + PKCE + publish helpers
- `src/app/api/mrai/integrations/linkedin/connect/route.ts`
- `src/app/api/mrai/integrations/linkedin/callback/route.ts`
- `src/app/api/mrai/integrations/x/connect/route.ts`
- `src/app/api/mrai/integrations/x/callback/route.ts`
- `src/app/api/mrai/publish/route.ts` — POST API
- `supabase/migrations/0071_mrai_publish.sql` — DB schema

---

*작성: Mr.AI (Claude Opus 4.7) — 2026-06-05*
