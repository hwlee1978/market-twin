# 르무통(Le Mouton) — Mr. AI 실전 도입 Playbook

> **임원 본인이 매일 아침 출근하면서 Slack에서 Mr. AI의 Briefing을 받고, HubSpot 거래 정보까지 자동으로 동기화되는 상태**를 목표로 한다.
>
> 소요 시간: 약 60~90분 (HubSpot OAuth 앱 등록이 가장 김)

---

## Phase 0 · 새 계정? 새 워크스페이스? (먼저 답)

### 결론: **새 계정 X · 새 워크스페이스 O**

Market Twin의 데이터 모델은:

```
account (email)        ← 본인 계정 그대로 사용
  └── workspace 1      "내부 테스트"
  └── workspace 2      "르무통" ← 여기 새로 만든다
        ├── memories         (르무통 사업 컨텍스트)
        ├── briefings        (매일 08 KST Slack로 발송)
        ├── channels         (Slack / Email)
        ├── integrations     (HubSpot OAuth)
        ├── projects         (시뮬레이션)
        └── kg / feedback    (자동 누적)
```

- **memory / briefing / channel / integration은 모두 워크스페이스 단위로 격리**된다 (migrations 0029~0037 전부 `workspace_id` FK).
- 본인 super admin 계정으로 로그인 → 워크스페이스 스위처에서 "르무통" 추가 → 끝.
- 르무통 임원 본인 이메일을 멤버로 초대하면, 그 분도 같은 워크스페이스 컨텍스트를 공유.

> **만약 르무통 임원에게 100% 분리된 환경을 주고 싶다면**: 그분 회사 이메일로 별도 가입 → 별도 워크스페이스. 단 결제/구독도 분리됨.

---

## Phase 1 · 워크스페이스 생성 (5분)

### 1.1 dev 서버 실행 (운영이라면 skip)
```bash
npm run dev
# http://localhost:3000
```

### 1.2 로그인
- 기존 super admin 계정으로 `/login`
- 또는 운영 도메인: `app.markettwin.ai/login`

### 1.3 워크스페이스 생성
- 우상단 워크스페이스 스위처 → "새 워크스페이스"
- 이름: `르무통` (또는 `Le Mouton`)
- 산업: (르무통 본업에 맞춰 선택)
- 언어: 한국어
- 시간대: Asia/Seoul

> Signup이 막혀있다면 (`NEXT_PUBLIC_SIGNUP_ENABLED=false`), `/admin/customers` → "워크스페이스 추가"로 super admin 권한으로 생성.

### 1.4 본인을 멤버로 초대 (이미 super admin이면 skip)
- `/settings/team` → "초대"
- 르무통 임원 본인 이메일 입력 → 역할: Owner

✅ **Check:** 좌측 사이드바에 `르무통` 워크스페이스가 active로 보임.

---

## Phase 2 · 임원·회사 프로파일 메모리 시딩 (10분)

이 단계가 **Mr. AI의 모든 답변 품질을 결정**한다. 메모리가 없으면 일반 LLM 챗봇과 다를 게 없음.

### 2.1 `/mr-ai` 페이지 → "Chat" 탭으로 이동

### 2.2 첫 메시지로 회사 컨텍스트 한 번에 주입

아래 템플릿을 본인 사업에 맞게 채워서 한 번에 붙여넣기:

```
[Mr. AI에게 첫 컨텍스트 주입]

회사: 르무통 (Le Mouton)
업종: [예: 프리미엄 울 니트 D2C / 가구 / F&B 등 본인 사업 입력]
설립: [____년]
직원수: [____명]
현 매출: [연 ____억]
주력 채널: [예: 자사몰 70% / 무신사 20% / 오프라인 10%]
주력 카테고리: [예: 캐시미어 코트, 메리노 니트]
주요 경쟁사: [국내 ____, 글로벌 ____]
목표 시장 (확정): [예: 한국]
검토 중인 진출 시장: [예: 일본, 미국, 대만]

내 직책: [예: 대표, COO, CMO, 사업개발 임원]
내 관심사 (중요도순):
  1. [예: 일본 진출 타이밍과 채널 전략]
  2. [예: 캐시미어 가격대 검증]
  3. [예: 경쟁사 어센틱브랜드/매그놀리아 동향]

KPI:
  - [예: Q3 일본 무신사 JP 입점]
  - [예: 2026 연매출 ____억]
  - [예: 신제품 캐시미어 라인 가을 출시]

이 정보를 메모리에 저장해줘. 앞으로 모든 답변에 이 컨텍스트를 반영해.
```

### 2.3 자동 추출 확인
- Mr. AI가 응답 후, "Memory" 패널 새로고침
- 회사명·KPI·경쟁사 등이 항목별로 분리 저장됐는지 확인
- 잘못 추출된 게 있으면 직접 편집

> **왜 이렇게 하나?** [agents/strategist.ts](src/lib/mrai/agents/strategist.ts)가 매 대화 첫 단계에 메모리를 읽는다. 메모리가 부실하면 Strategist가 일반론적 Plan만 수립.

### 2.4 (옵션) Knowledge Graph 미리 채우기

```
르무통 경쟁사 어센틱브랜드는 미국 시장에서 강하고, 매그놀리아는 일본 도쿄 시부야 진출 사례가 있다.
어센틱브랜드 → competes_with → 르무통
매그놀리아 → located_in → 일본 도쿄
이 관계를 KG에 추가해줘.
```

✅ **Check:** `/mr-ai` → "Knowledge Graph" 탭에 엔티티 노드 5~10개 표시.

---

## Phase 3 · HubSpot OAuth 연결 (20~30분, 가장 오래 걸림)

### 3.1 HubSpot 개발자 앱 생성 (한 번만)

1. https://developers.hubspot.com → "Create app"
2. 앱 정보:
   - Name: `르무통 Mr. AI Integration`
   - Description: CEO assistant integration
3. **Auth 탭**:
   - Redirect URL: `https://app.markettwin.ai/api/mrai/integrations/hubspot/callback`
   - 로컬 테스트도 동시: `http://localhost:3000/api/mrai/integrations/hubspot/callback`
   - Scopes: `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.deals.read`, `crm.objects.deals.write`, `oauth`
4. **Client ID / Client Secret 복사**

### 3.2 환경변수 등록

`.env.local` (로컬) + Vercel Dashboard (운영) **양쪽 모두**:

```bash
HUBSPOT_CLIENT_ID=...
HUBSPOT_CLIENT_SECRET=...
HUBSPOT_REDIRECT_URI=https://app.markettwin.ai/api/mrai/integrations/hubspot/callback
```

> ⚠️ **메모리 기록에 따르면** 외부 API 통합 시 Vercel env와 Cloud Run worker env **양쪽 동기화 필수**. ([Vercel env for external APIs](C:/Users/user/.claude/projects/c--Project-Market-Twin/memory/vercel_env_external_apis.md))

### 3.3 OAuth 연결
- `/mr-ai` → "Integrations" 탭
- "HubSpot 연결" 버튼 클릭
- HubSpot 로그인 → 권한 승인 → 콜백 자동 처리
- 성공 시 "Connected · 마지막 동기화: 방금" 표시

### 3.4 첫 동기화
- "동기화" 버튼 클릭 또는 `POST /api/mrai/integrations/hubspot/sync` 호출
- Contact / Deal이 메모리에 자동 추가되어, Mr. AI가 "이번 주 마감 임박 거래 3개"를 인식하게 됨

✅ **Check:** Chat에서 `"이번 주 마감 임박 HubSpot 거래 알려줘"` 질문 → 실제 거래명·금액 응답.

---

## Phase 4 · Slack Webhook 채널 연결 (10분)

### 4.1 Slack Incoming Webhook 생성
1. https://api.slack.com/apps → "Create New App" → "From scratch"
2. Name: `Mr. AI Briefing`
3. Workspace: 르무통 Slack 워크스페이스
4. **Incoming Webhooks** 토글 ON
5. "Add New Webhook to Workspace" → 채널 선택 (예: `#leadership-daily` 또는 본인 DM)
6. Webhook URL 복사 (`https://hooks.slack.com/services/T.../B.../...`)

### 4.2 Mr. AI에 채널 등록
- `/mr-ai` → "Channels" 탭 → "추가"
- Type: **Slack**
- Name: `르무통 리더십 데일리`
- Webhook URL: 위에서 복사한 URL
- Trigger: `daily_briefing` (매일 Briefing 자동 발송)
- Format: `Block Kit` (기본)

### 4.3 테스트 발송
- 채널 카드의 "테스트" 버튼 클릭
- Slack 채널에 "Mr. AI Test · 정상 연결" 메시지 확인

✅ **Check:** Slack에 테스트 카드 도착. 클릭 가능한 "대시보드 열기" 버튼 포함.

---

## Phase 5 · Email 채널 설정 (5분)

### 5.1 Email 채널 추가
- `/mr-ai` → "Channels" → "추가"
- Type: **Email**
- Name: `임원 일일 브리핑`
- 수신 이메일: `hwlee197874@gmail.com` (또는 르무통 임원 이메일, 다중 가능)
- Trigger: `daily_briefing` + `critical_alert`
- 발송 시간: `08:00 KST`
- Format: HTML

### 5.2 SMTP 확인
- 운영 환경에서 사용 중인 메일 발송 서비스 (SendGrid / AWS SES / Resend 등) env 확인
- `RESEND_API_KEY` 또는 `SMTP_*` 변수가 설정돼 있어야 함

### 5.3 테스트 발송
- "테스트" 버튼 → 받은편지함에 도착 확인 (스팸함 체크)

---

## Phase 6 · 첫 시뮬레이션 — Mr. AI의 "근거 자료" 만들기 (15~25분)

Mr. AI의 Briefing은 **메모리 + KG + 시뮬 결과**를 합쳐 만든다. 시뮬이 없으면 Briefing이 빈약해짐.

### 6.1 르무통 신제품 글로벌 진출 시뮬레이션
- `/projects/new` (르무통 워크스페이스에서)
- 제품: `[예: 캐시미어 100% 롱코트, 280만원, FW26]`
- 카테고리: 패션 > 아우터
- 제조국: 한국
- 검토 시장: 일본, 미국, 대만, 싱가포르 (4국)
- 경쟁사 URL 또는 이름 입력
- **Tier 선택: Decision (6 sims, ~$25)** — 첫 운영은 Decision 권장

### 6.2 시뮬 시작 → 결과 확인 (10~20분 소요)
- 진행률 watch
- 결과: Best Country 분포 + 세그먼트별 추천 + Persona 200명 voice
- PDF 다운로드 / 공유 링크 생성

### 6.3 Mr. AI에게 시뮬 결과 연결
Chat에서:
```
방금 끝난 시뮬레이션 [프로젝트명] 결과를 메모리에 통합해줘.
앞으로 "일본 진출" 관련 질문에는 이 시뮬의 Best Country 점수와
세그먼트 추천을 인용해서 답해.
```

✅ **Check:** Chat에서 `"일본 시장 어때?"` → 시뮬 결과 인용 (점수, 세그먼트, 가격대) 응답.

---

## Phase 7 · 첫 Daily Briefing 트리거 (3분)

### 7.1 수동 트리거 (즉시 받기)
- `/mr-ai` → "Briefing" 탭 → "지금 생성" 버튼
- 또는 API: `POST /api/mrai/briefings` (body: `{ "workspaceId": "..." }`)

### 7.2 출력 확인
3-section Markdown:
```
## 어제 요약
- 르무통 캐시미어 코트 일본 시장 시뮬레이션 완료 (Decision tier)
- Best Country: 일본 (점수 72) > 미국 (68)
- HubSpot 거래 2건 추가 (각 ____만원)

## 오늘 챙길 것
- 일본 진출 관련 무신사 JP 입점 미팅 (캘린더 ✓)
- 어센틱브랜드 신제품 발표 모니터링
- 마감 임박 거래 [거래명] f/u

## 주의 신호·질문
- 시뮬 결과 미국 점수 68도 높음 — 일본 단독 vs 일본+미국 동시 진출 결정 필요?
- 캐시미어 가격대 280만원 → Persona voice "20대 후반 ~ 30대 초반 부담" 지적
```

### 7.3 Slack/Email 자동 발송 확인
- Slack `#leadership-daily` 채널 + 이메일 받은편지함 둘 다 동일 내용 도착

### 7.4 Vercel Cron 활성화 확인
- `vercel.json`의 crons 항목 확인:
  ```json
  { "path": "/api/mrai/briefings/cron", "schedule": "0 23 * * *" }
  ```
  (UTC 23:00 = KST 08:00)
- 운영 배포 후 다음날 아침 자동 발송 확인

---

## Phase 8 · 실전 루틴 (매일·매주)

### 8.1 매일 아침
- **08:00 KST**: Slack DM + Email로 Briefing 자동 도착
- 출근길에 모바일로 훑어보기
- 챙길 것 중 액션 필요한 건 → Slack 답글로 본인에게 reminder

### 8.2 임원 회의 전 (주 2~3회)
Chat에서:
```
오늘 12시 임원회의용 자료 만들어줘.
주제: [예: 일본 진출 GO/NO-GO 결정]
필요 데이터: 시뮬레이션 결과, HubSpot 파이프라인, 경쟁사 최근 동향
포맷: A4 1장 요약 + 의사결정 옵션 3개
```
→ Strategic Brief 자동 생성 (`/mr-ai` → "Content Briefs" 탭에 저장)

### 8.3 의사결정 직후
응답에 **Good/Bad 피드백** 클릭 — KPI Loop가 향후 답변 품질 자동 개선.

### 8.4 매주 금요일
- Briefing 한 주치 묶음 보기
- 메모리 정리 (오래된 KPI 업데이트, 종료된 거래 제거)
- 신규 경쟁사·시장 정보를 메모리에 추가

### 8.5 매월
- Mr. AI 사용량 / LLM 비용 점검 (`/admin/health`)
- HubSpot 동기화 정상 동작 확인 (`/mr-ai` → "Integrations" 마지막 동기화 시각)

---

## ✅ 도입 완료 Checklist

- [ ] 르무통 워크스페이스 생성됨
- [ ] 회사 컨텍스트 메모리 시딩 (10개 이상 항목)
- [ ] HubSpot OAuth 연결 + 첫 동기화 성공
- [ ] Slack Incoming Webhook 채널 등록 + 테스트 발송 성공
- [ ] Email 채널 등록 + 테스트 도착 확인
- [ ] 첫 시뮬레이션 1건 완료 + 결과 메모리 통합
- [ ] 수동 Briefing 생성 → Slack/Email 모두 도착
- [ ] Vercel Cron 활성화 (다음날 자동 발송 검증)
- [ ] 임원 회의용 Strategic Brief 1건 생성 경험

---

## Appendix A · 메모리 시딩 SQL 템플릿

UI 없이 직접 시딩하고 싶을 때 (Supabase SQL Editor):

```sql
-- 워크스페이스 ID 먼저 조회
SELECT id, name FROM workspaces WHERE name = '르무통';
-- → 결과 workspace_id를 아래 :ws_id에 대입

INSERT INTO mrai_memories (workspace_id, type, content, importance, created_at)
VALUES
  (':ws_id', 'company', '르무통은 프리미엄 캐시미어/울 D2C 브랜드, 설립 ____년, 직원 ____명', 10, now()),
  (':ws_id', 'kpi', '2026 Q3까지 일본 무신사 JP 입점 목표', 9, now()),
  (':ws_id', 'competitor', '국내 경쟁: 어센틱브랜드 (미국 강세), 매그놀리아 (일본 도쿄 진출)', 8, now()),
  (':ws_id', 'product', '주력 SKU: 캐시미어 100% 롱코트 280만원, FW26 출시 예정', 8, now()),
  (':ws_id', 'channel', '주력 채널: 자사몰 70% / 무신사 20% / 오프라인 10%', 7, now()),
  (':ws_id', 'executive_profile', '의사결정자: [본인 이름], 직책 [____], 관심사 1순위 일본 진출 타이밍', 10, now());
```

## Appendix B · 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| Briefing이 일반론적 | 메모리 시딩 부족 | Phase 2 다시, 항목 10개 이상 |
| Slack 발송 안 됨 | Webhook URL 오타 / 채널 archive | "테스트" 버튼으로 재검증, URL 재발급 |
| HubSpot "Connect failed" | Redirect URI 불일치 | HubSpot 앱 설정과 env `HUBSPOT_REDIRECT_URI` 정확히 일치 확인 |
| 시뮬 결과가 Briefing에 안 반영 | Mr. AI가 시뮬 메모리 통합 못함 | Phase 6.3 명시적으로 "메모리에 통합해줘" 지시 |
| Cron이 안 돌음 | Vercel 배포 후 cron 미활성 | `vercel.json` 확인 + Vercel Dashboard → Cron Jobs 확인 |
| Daily briefing 비용 폭증 | 메모리 1000+ 누적 | pgvector semantic retrieval로 자동 전환됨 (50개 초과 시) — 정상 |

---

## 다음 단계 (이번 playbook 이후 1~2주 내)

1. **르무통 임원 본인이 직접 1주일 dogfooding** → 어떤 답변이 부족한지 메모
2. 그 피드백을 메모리에 추가 시딩 → Briefing 품질 개선
3. **Content Brief 템플릿 커스터마이즈**: 르무통 임원회의 양식에 맞게 조정 ([content/strategist.ts](src/lib/mrai/content/strategist.ts))
4. **Knowledge Graph 시각화** 정기 검토 → 엔티티 누락·중복 정리
5. **두 번째 시뮬** 추가 (다른 제품 카테고리) → 시뮬 corpus 키우기

> Mr. AI는 메모리·KG·시뮬 corpus가 누적될수록 정확도가 올라간다. **첫 2주는 "시딩 기간"이라고 생각**하고 적극적으로 정보를 제공할 것.
