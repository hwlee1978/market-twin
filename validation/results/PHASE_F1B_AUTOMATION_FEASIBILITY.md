# Phase F.1-B automation feasibility study

Drafted 2026-05-18 after user critique: "per-fixture KOTRA toggle은 제품별로
사전 조사해서 정한다는 것은 말이 안되잖아." Same critique applies to the
existing manual `brand-region-revenue.json` — it's hand-curated for 8
fixtures, doesn't scale to user-uploaded products in production.

This document captures what's actually possible for auto-generating brand×
region revenue tables from public Korean data sources.

## DART parser feasibility (per-fixture)

DART 사업보고서 본문 XML inspection on 2 representative fixtures:

### Binggrae (melona) — **NOT feasible**
- Sample rcept_no 20250312000859 (2024 annual report)
- Report text: **"연결기업의 공시대상 사업부문은 유가공 단일 부문으로 구성되어 있으므로 사업부문별 주요 재무정보(총액 및 비중) 기재는 생략합니다."**
- K-IFRS 8 allows single-segment entities to skip per-segment disclosure
- Only narrative mention of overseas subsidiaries: "BC F&B Shanghai Co., Ltd., BC F&B USA Corp., BC F&B Vietnam Co., Ltd."
- No revenue numbers per region available in DART filing

### CJ제일제당 (bibigo) — **Feasible**
- Sample rcept_no 20250321001604 (2024 annual report, amended)
- Report text contains "나. 지역별 영업현황 지역에 대한 공시 당기 (단위: 천원) 본사 소재지 국가 / 아시아 / ..."
- Multi-segment 회사 (식품/BIO/Feed&Care/물류) → K-IFRS 8 mandates per-segment + per-region disclosure
- Region table is structured: rows = regions, columns = 매출 / 영업이익 / 자산 (typical K-IFRS 8 disclosure)

### Per-fixture predicted feasibility

Categorized by likely segment structure (validated for 2, predicted for others):

| Fixture | Parent corp | Segment structure (predicted) | Auto-parse feasible? |
|---|---|---|---|
| bibigo-mandu | CJ제일제당 | multi (verified) | ✅ |
| cosrx-snail-mucin | LG생활건강 | multi (화장품/생활용품/음료) | ✅ |
| lg-oled-tv-c-series | LG전자 | multi (HE/HA/VS/BS) | ✅ |
| kgc-everytime-redginseng | KT&G | multi (담배/인삼/부동산) | ✅ |
| orion-chocopie | 오리온 | multi (제과/식품/엔터테인먼트) | ✅ likely |
| laneige-lip-sleeping-mask | 아모레퍼시픽 | multi (럭셔리/프리미엄/매스) | ✅ likely |
| cj-hetbahn | CJ제일제당 | same as bibigo | ✅ |
| lotte-pepero | 롯데웰푸드 | multi (제과/유음료) | ✅ likely |
| shin-ramyun | 농심 | single (식품) | ⚠ unclear |
| buldak | 삼양식품 | single (식품) | ⚠ unlikely |
| jinro-chamisul | 하이트진로 | single (주류) | ❌ unlikely |
| binggrae-melona | 빙그레 | single (verified) | ❌ |
| mediheal-maskpack | L&P코스메틱 | unlisted (no DART) | ❌ |
| anua-heartleaf-toner | indie | unlisted | ❌ |
| boj-relief-sun | indie | unlisted | ❌ |

**Coverage**: 8/15 likely feasible, 4/15 unlikely, 3/15 not in DART at all.

## Hybrid path — 3 source combination

Single-source auto-generation is insufficient. Honest scalable path uses
3 sources in priority order:

### 1. DART region segment parser (top priority — production-ready)
- Multi-segment K-IFRS 8 disclosure has structured region × revenue
- Parser pattern: locate "지역별 영업현황" or "지역에 대한 공시" within XML
- Extract `<TD>` rows under that table heading
- Map region names (아시아/미주/유럽 등) to ISO countries with category-specific heuristic
- **Coverage**: CJ/LG/KT&G/Orion/AMOREPACIFIC/Lotte (~50% of fixtures)
- **Implementation**: 1-2 days dev + DART API quota (free tier 10K/day)

### 2. KOTRA compSucsCase (secondary — list-only, no revenue $)
- Already-registered KOTRA API endpoint (commit 82b3b74)
- Per-brand search returns success-case rows by country
- Useful for **inferring presence** even when revenue is unavailable
- **Coverage**: any brand registered with KOTRA = most exporters
- **Limitation**: no quantitative revenue, only "this brand reached this market" boolean
- **Implementation**: half-day to extend existing module

### 3. LLM narrative extraction (fallback for single-segment + unlisted)
- For Binggrae-style single-segment reports: scrape "주요 제품 및 서비스" narrative
- For unlisted brands (mediheal/anua/boj): scrape brand official site + press releases
- Prompt Claude/GPT with extracted text → JSON {country, evidence_strength}
- **Coverage**: residual ~30% of fixtures
- **Cost**: ~$0.05-0.10 per brand per refresh
- **Implementation**: 1 day

### Combined coverage projection
- DART parser alone: 8/15 fixtures (53%)
- + KOTRA boolean overlay: 14/15 (93%) — all but pure indie
- + LLM narrative fallback: 15/15 (100%)
- Refresh cadence: monthly is sufficient (sales reports lag 3 months)

## Implementation phases

| Phase | Scope | Days | Cost |
|---|---|---|---|
| 1 | DART parser CJ제일제당 only (pilot) | 1 | $0 (free API) |
| 2 | Extend parser to LG생활건강/LG전자/KT&G (top 4 corp) | 1 | $0 |
| 3 | Region-name → ISO mapping + revenue normalization | 0.5 | $0 |
| 4 | KOTRA compSucsCase overlay for boolean presence | 0.5 | $0 |
| 5 | LLM extractor for single-segment + unlisted brands | 1 | ~$3 (15 brands × $0.20) |
| 6 | Auto-generated brand-region-revenue.json + cache | 0.5 | $0 |
| 7 | Production runtime fetch + 30-day cache | 1 | $0 |
| 8 | A/B benchmark (auto vs current manual) | 0.5 | ~$60 (8 fixture re-spawn) |

**Total**: ~6 days dev, ~$65 sim cost for validation A/B.

## Decision gate

Before starting phase 1, verify:

1. **Is this the highest-leverage work right now?**
   - vs outcome feedback loop ([[outcome-feedback-design]])
   - vs F.2 weight refresh (post-v7 generation only)
   - vs KOTRA per-fixture toggle (rejected by user as unscalable)
   - vs Phase F.1 honest close + v0.1 ship readiness work

2. **Will it improve production accuracy meaningfully?**
   - Manual region table for 8 fixtures lifted v7 mean to 72 (likely fixture-tuned)
   - Auto-generated for 15 user products could match or exceed this for multi-segment categories
   - Unlikely to break the LLM US-prior ceiling that v9 (mean 58.7) exposed
   - Hard cap: ~mean 65 even with full auto-region table

3. **Is the alternative (outcome feedback) more leverage long-term?**
   - Outcome feedback breaks the anchor ceiling (path to mean 80+)
   - DART auto-parser stays within anchor ceiling

**Recommendation**: ship DART parser to remove "fixture-tuned" caveat from
honest disclosure, but don't expect dramatic mean lift. The path to 80+
remains outcome-feedback or per-LLM weighting refresh, not more anchors.

## Cross-references

- [[production-vs-fixture-tuned-anchors]] — user critique that motivated this study
- [[outcome-feedback-design]] — the alternative long-term ceiling break path
- [[anchor_design_lessons]] — failure mode #5 (small-sample illusion) applies
- [[v9_n15_honest_reality]] — production reality measurement baseline
- Repo: `validation/reference/brand-region-revenue.json` (current manual file)
