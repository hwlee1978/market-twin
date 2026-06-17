# 베타 모집 — 채널별 UTM 링크 & 배포본 안내

> 모집 채널별로 **UTM 링크**를 다르게 쓰면, 어느 채널에서 가입·전환이 나오는지 PostHog에서 자동으로 구분됩니다. (PostHog는 `utm_*` 파라미터를 자동 수집)

---

## 기본 랜딩 URL

```
https://app.markettwin.ai/ko/beta      (한국어)
https://app.markettwin.ai/en/beta      (영어)
```

---

## UTM 규칙

`?utm_source=<채널>&utm_medium=<유형>&utm_campaign=beta` 를 붙입니다.

- `utm_source` — 구체 채널 (linkedin, disquiet, kotra, email …)
- `utm_medium` — 유형 (social, community, dm, email, partner …)
- `utm_campaign` — 캠페인 고정값: **`beta`**

---

## 채널별 복사용 링크

| 채널 | 링크 |
|---|---|
| 링크드인 포스트 | `https://app.markettwin.ai/ko/beta?utm_source=linkedin&utm_medium=social&utm_campaign=beta` |
| 링크드인 DM | `https://app.markettwin.ai/ko/beta?utm_source=linkedin&utm_medium=dm&utm_campaign=beta` |
| 디스콰이엇/커뮤니티 | `https://app.markettwin.ai/ko/beta?utm_source=disquiet&utm_medium=community&utm_campaign=beta` |
| 스타트업 단톡/오픈채팅 | `https://app.markettwin.ai/ko/beta?utm_source=kakao&utm_medium=community&utm_campaign=beta` |
| 이메일 직접 초대 | `https://app.markettwin.ai/ko/beta?utm_source=email&utm_medium=invite&utm_campaign=beta` |
| KOTRA/기관 파트너 | `https://app.markettwin.ai/ko/beta?utm_source=kotra&utm_medium=partner&utm_campaign=beta` |
| 블로그/콘텐츠 | `https://app.markettwin.ai/ko/beta?utm_source=blog&utm_medium=content&utm_campaign=beta` |
| 영어권(글로벌) | `https://app.markettwin.ai/en/beta?utm_source=linkedin&utm_medium=social&utm_campaign=beta` |

> 새 채널이 생기면 `utm_source`만 바꿔 추가하면 됩니다. 짧은 링크가 필요하면 Bitly 등으로 줄여 쓰되, 원본 UTM은 유지하세요.

---

## 측정 (PostHog)

가입·전환을 채널별로 보려면 PostHog에서:
- **이벤트**: `signup_started` / `signup_completed` (이미 코드에 적재됨)
- **분석**: 위 이벤트를 `utm_source` / `utm_campaign` 으로 **breakdown**
- **퍼널**: `/beta` 방문 → `signup_started` → `signup_completed` → 첫 시뮬

---

## 테스터 매뉴얼 배포본 (노션 / PDF)

테스터에게 줄 가이드는 **`docs/beta/tester-guide.md`** 입니다. 배포 방법:

**노션으로**
1. `tester-guide.md` 내용을 복사
2. 노션 새 페이지에서 붙여넣기 → 노션이 마크다운을 자동 변환
3. 페이지를 "웹에 게시(Share → Publish)" → 링크를 테스터에게 전달

**PDF로**
1. 노션 페이지에서 `... → Export → PDF`, 또는
2. VS Code에서 마크다운 미리보기 → 인쇄 → PDF로 저장, 또는
3. `pandoc tester-guide.md -o tester-guide.pdf` (pandoc 설치 시)

> 마크다운 원본이 단일 출처(source of truth)이니, 내용이 바뀌면 마크다운을 고치고 노션/PDF를 다시 내보내면 됩니다.
