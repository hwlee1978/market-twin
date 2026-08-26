---
title: "Mr.AI 확장 기능 명세 — Market Twin 대비 추가분"
subtitle: "시뮬레이션 도구(Market Twin) → 1인 CEO 운영 OS(Mr.AI)로의 확장"
author: "주식회사 미스터에이아이 (Mr.AI Inc.)"
date: "발행일 2026년 7월 · 문서버전 v1.0"
lang: ko
---

## 0. 이 문서의 범위

Market Twin(출시 시뮬레이션)의 기존 기능은 별도 규격서(`product-spec.md`)에 정리되어 있다.
본 문서는 **Market Twin 위에 Mr.AI로 새로 얹힌 기능만** 분리하여 정리한다.

- **Market Twin** = 출시 전 시장 검증 시뮬레이션 (제품·가격·페르소나·경쟁사·리포트)
- **Mr.AI** = Market Twin을 **의사결정 지원 모듈 1개로 흡수**하고, 그 위에 마케팅·영업·IR·콘텐츠·SEO·일일 브리핑을 얹은 **1인 CEO 운영 OS**

즉 포함 관계는 **Mr.AI ⊃ Market Twin**. 시뮬레이션은 Mr.AI의 5개 모듈 중 "Decision Support" 한 칸이다.

> 코드 상 분리: 같은 repo·같은 Vercel 프로젝트, `NEXT_PUBLIC_MRAI_ENABLED` / 호스트(`mrai.markettwin.ai`)로 노출 여부만 분기.
> `markettwin.ai` = 시뮬레이션 전용, `mrai.markettwin.ai` = Mr.AI 전체 노출. (`src/lib/mrai/config/enabled.ts`)

---

## 1. 카테고리 격상 — 무엇이 달라졌나

| | Market Twin | Mr.AI 확장 후 |
|---|---|---|
| 정의 | AI 출시 시뮬레이션 **도구** | 마케팅·영업·IR·전략·운영을 위임받는 **AI 임원(CEO OS)** |
| 사용 방식 | 프로젝트 생성 → 시뮬 실행 → 리포트 열람 (단발성) | 대화 + 매일 자동 브리핑 + 자동 콘텐츠 발행 (상시 운영) |
| 기억 | 프로젝트 단위, 세션 종료 시 종료 | **영속 메모리 + 지식그래프** (워크스페이스 평생 누적) |
| 출력 | PDF 리포트 | 리포트 + 콘텐츠 초안 + 실제 SNS 발행 + Slack/이메일 브리핑 |
| 경쟁군 | 시장조사·서베이 도구 | 마케팅 OS(DOJO·HubSpot Breeze·Klaviyo) — 단, Mr.AI는 **전략 의사결정 레이어**까지 포함 |

핵심 메시지: *"마케터 1명 자동화"가 아니라 "Founder 1명이 임원 5명처럼 운영"*.

---

## 2. 아키텍처 — 5 모듈 + 3 레이어 (신규)

```
L1  CEO Mr.AI · Orchestrator
     사용자 지시 → 모듈 라우팅 + plan 합성 + 결과 통합 narrative
     │
     ├─ Marketing         콘텐츠·SEO·다채널 발행
     ├─ Sales             cold outreach·답장·follow-up (HubSpot 파이프라인 연동)
     ├─ IR                투자자 업데이트·KPI 대시보드·미팅 brief
     ├─ Decision Support  시장·가격·채널 전략 답  🔄 = 기존 Market Twin 엔진
     └─ Daily Briefing    아침 5분 브리핑·액션 plan

 [VOICE]   Voice DNA Layer — 모든 모듈 출력의 최종 톤 변환
 [MEMORY]  Persistent Memory — 프로필·회사 context graph·의사결정 log 평생 누적
 [ATTR]    Attribution Engine — 모든 action에 tracking ID → "Mr.AI가 한 일 → 매출" 폐루프
```

- **3-Layer Orchestrator**(`src/lib/mrai/agents/orchestrate.ts`): L1 Strategist(계획) → L2 Analyst(근거 수집: 메모리·시그널·KG) → L3 Synthesizer(합성). 단순 인사·확인은 저비용 1콜 모드로 자동 분기.
- 기술 스택은 Market Twin 인프라를 **그대로 확장**(Next.js · Supabase · Multi-LLM · prompt caching).

---

## 3. 추가 기능 상세 (모듈별)

### 3-1. Mr.AI 챗 / 오케스트레이터
| 항목 | 내용 |
|---|---|
| 기능 | 자연어로 전략·마케팅·영업 질문 → 3-레이어 에이전트가 메모리·시뮬 결과·CRM을 근거로 답변 |
| 동작 | Strategist(계획) → Analyst(근거) → Synthesizer(합성), 트레이스는 `mrai_agent_traces`에 저장(디버깅·품질학습용) |
| 기대효과 | 일반 LLM 챗봇과 달리 **회사 컨텍스트에 고정된 답변**. 임원 회의 자료·GO/NO-GO 판단 근거를 즉시 생성 |

### 3-2. 영속 메모리 + 지식그래프 (Persistent Memory / KG)
| 항목 | 내용 |
|---|---|
| 기능 | 회사 프로필·KPI·경쟁사·제품·채널·의사결정 로그를 항목별로 저장하고, 이후 모든 답변에 자동 반영 |
| 구성 | 메모리(`mrai_memories`) + 임베딩(pgvector, `0031`) + 지식그래프(엔티티·관계, `0034`) |
| 확장성 | 메모리 50개 초과 시 pgvector **의미 검색으로 자동 전환**(비용·정확도 최적화) |
| 기대효과 | 쓸수록 똑똑해짐 — 첫 2주 시딩 이후 브리핑·전략 답변 품질이 누적적으로 상승 |

### 3-3. 데일리 브리핑 (Daily Briefing)
| 항목 | 내용 |
|---|---|
| 기능 | 매일 아침 08:00 KST, "어제 요약 / 오늘 챙길 것 / 주의 신호·질문" 3섹션 자동 생성 |
| 근거 | 메모리 + 지식그래프 + 최근 시뮬 결과 + CRM 거래 + 크롤 시그널을 합성 |
| 발송 | Slack(Block Kit)·이메일(HTML)로 자동 발송, Vercel Cron(`0 23 * * *` UTC) |
| 기대효과 | 임원이 출근길에 회사 상태를 5분에 파악. 대시보드에 들어가지 않아도 운영이 굴러감 |

### 3-4. 콘텐츠 생성 엔진 (Content)
| 항목 | 내용 |
|---|---|
| 텍스트 | 채널별 초안 자동 작성(`drafter`), 콘텐츠 전략가(`content-strategist`)·브리프(`briefs`) |
| 이미지 | 제품 이미지 생성·보정(`image-gen`, `product-touchup`), 라이프스타일 컷 생성(`lifestyle-gen`), 배경 제거(`bg-removal`), 로고 합성·배치(`logo-placement`, `composite-logo`) |
| SEO | 초안별 SEO 점수화(`seo-score`), 키워드 리서치(`keyword-research`) |
| 미리보기 | Instagram·X·TikTok·YouTube·네이버 블로그·스마트스토어 **플랫폼별 실제 렌더 미리보기** |
| 캘린더 | 콘텐츠 캘린더 + 예약 발행(`schedule`), 가상 공간 피드(발행 전 시뮬 반응) |
| 기대효과 | 카피 + 이미지 + SEO + 발행 미리보기까지 **디자이너·마케터 없이** 한 사람이 완결 |

### 3-5. 마케팅 채널 & 자동 발행 (Marketing Channels)
| 항목 | 내용 |
|---|---|
| 기능 | 채널 등록 → 주제 추천 → 초안 생성 → 예약 → **자동 발행**까지 파이프라인 |
| 자동화 | 발행 크론(`content-drafts/auto-publish-cron`, `publications/cron`)이 예약분을 자동 게시 |
| 발행 전 검증 | 초안을 시뮬(`content-drafts/[id]/simulate`)로 사전 반응 예측 → Market Twin 엔진 재활용 |
| 기대효과 | "기획→제작→발행" 사이클을 무인화. 채널별 최적 톤·포맷을 플랫폼 규칙(`platform-rules`)으로 강제 |

### 3-6. 외부 통합 & 어트리뷰션 (Integrations)
| 항목 | 내용 |
|---|---|
| CRM | **HubSpot OAuth** — Contact·Deal 자동 동기화 → "마감 임박 거래" 인식 |
| 소셜 | **X(Twitter)·LinkedIn OAuth** 연결, 다계정 지원(`0073`) |
| 발송 채널 | Slack Webhook·이메일 디스패치 채널(`dispatch-channels`) |
| 어트리뷰션 | 모든 action에 tracking ID → HubSpot·GA4 연동으로 "Mr.AI가 한 일 → 매출" 폐루프 |
| 기대효과 | 영업 파이프라인·매출까지 하나로 연결. 마케팅 활동의 ROI를 수치로 귀속 |

### 3-7. SEO / LLM-SEO (Analytics)
| 항목 | 내용 |
|---|---|
| 검색 SEO | Google Search Console 동기화(`gsc-sync`)·GA4 동기화(`ga4-sync`)·브랜드 SEO 패널 |
| LLM 가시성 감사 | ChatGPT·Claude 등 **LLM이 우리 브랜드를 어떻게 답하는지** 감사(`llm-visibility-audit`) + 이력 추세 |
| 기대효과 | 전통 SEO + "AI 검색 시대의 노출"을 동시 관리. LLM-SEO는 경쟁 마케팅 OS에 없는 차별점 |

### 3-8. 시장 크롤링 (Crawl)
| 항목 | 내용 |
|---|---|
| 기능 | 등록한 웹사이트·뉴스 RSS를 주기 크롤(`crawl/cron`)해 시장·경쟁사 시그널 추출 |
| 활용 | 브리핑·챗 답변의 "최신 컨텍스트" 근거로 투입 |
| 기대효과 | 정적 통계(Market Twin)에 **실시간 동향**을 더해 답변 신선도 확보 |

### 3-9. 온보딩 / 자동 시딩 (Settings)
| 항목 | 내용 |
|---|---|
| 기능 | 가이드형 온보딩(`onboarding-spec`)으로 회사 프로필을 단계별 수집, PDF 업로드 시 메모리 자동 추출(`pdf-memory-extractor`) |
| 부가 | 이미지 생성 설정·콘텐츠 프리셋·브랜드 자산·제품 프로필 관리 |
| 기대효과 | 도입 초기 "시딩 부담"을 자동화 — 부실 메모리로 인한 일반론적 답변 방지 |

### 3-10. 피드백 / KPI 루프
| 항목 | 내용 |
|---|---|
| 기능 | 답변별 Good/Bad 피드백(`feedback`) → 향후 답변 품질 자동 개선 |
| 기대효과 | 사용할수록 특정 사용자·회사에 맞게 미세 조정되는 폐루프 |

### 3-11. 시뮬레이션 프로포저 (Market Twin 재연결)
| 항목 | 내용 |
|---|---|
| 기능 | 대화 맥락에서 Mr.AI가 **"이 시장, 이 티어로 시뮬 돌릴까요?"**를 먼저 제안(`simulation-proposer`) → 승인 시 Market Twin 엔진 실행 |
| 기대효과 | 시뮬을 별도 도구로 인지하지 않고 대화 흐름 안에서 자연스럽게 소비 |

---

## 4. 데이터 · 자동화 추가분 (요약)

**신규 DB 마이그레이션(0029~0073)**: 메모리·브리핑·임베딩·통합·에이전트 트레이스·지식그래프·피드백·채널·콘텐츠 브리프·온보딩·마케팅 채널·발행·다계정 통합 등. 전부 **workspace 단위 격리**(RLS).

**신규 Cron(백그라운드 자동화)** — `MRAI_CRON_ENABLED`로 게이팅:

| Cron | 역할 |
|---|---|
| `mrai/briefings/cron` | 매일 08 KST 데일리 브리핑 생성·발송 |
| `mrai/crawl/cron` | 시장·뉴스 시그널 크롤 |
| `mrai/content-drafts/auto-publish-cron` | 예약 콘텐츠 자동 발행 |
| `mrai/publications/cron` | 발행 상태 tick·후속 처리 |
| `mrai/seo/google/cron` | GSC·GA4 지표 동기화 |

---

## 5. 기대효과 종합

| 관점 | Market Twin 단독 | Mr.AI 확장 후 |
|---|---|---|
| 사용 빈도 | 의사결정 시점에 단발 | **매일** 브리핑·발행으로 상시 |
| 인력 대체 | 시장조사 리서처 | 마케터 + 콘텐츠 제작자 + 영업 어시스턴트 + IR 담당 + 전략 참모 |
| 산출물 | 리포트(읽고 끝) | 리포트 + 실제 발행물 + CRM 업데이트 + 매출 귀속 |
| 학습 | 없음(세션 종료) | 메모리·KG·피드백 누적으로 지속 향상 |
| 매출 연결 | 간접(참고자료) | 어트리뷰션으로 **직접 귀속** |

한 줄 요약: **Market Twin이 "출시 전 판단"을 준다면, Mr.AI는 그 판단을 매일의 실행·발행·추적까지 자동으로 이어붙인다.**

---

## 6. 공개 상태 (2026년 7월 기준)

- `markettwin.ai` = **시뮬레이션 전용(베타)** 노출. Mr.AI 패널 숨김.
- `mrai.markettwin.ai` = Mr.AI 전체 노출(개발 진행형).
- 크론은 UI 노출과 분리 게이팅(`MRAI_CRON_ENABLED`) — 한쪽 배포에서만 켜서 double-fire 방지.
- 사용자 대상 화면에서 **LLM 비용은 비노출** 원칙.
