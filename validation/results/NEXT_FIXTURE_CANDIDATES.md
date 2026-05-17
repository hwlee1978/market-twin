# Next ground-truth fixture candidates

Drafted 2026-05-17 after v7 result (mean 72.0, p=0.0086). For Phase F.2
sample-size expansion path B (10 → 15 fixtures). Selection criteria:

1. **Category diversity** — fill gaps in current K-Food/K-Beauty heavy mix.
2. **Region diversity** — pick brands with non-US-top markets (RU, CN regions, ASEAN, MENA) to keep the test from collapsing into "predict US-first".
3. **Public revenue evidence** — has DART filing or KOTRA case study so ground truth can be sourced from official records, not guessed.
4. **Known top-3 markets with ranked revenue** — necessary for top3Hit and rankCorrelation scoring.

## Recommended 5 (priority order)

### 1. 오리온 초코파이 ★★★ — K-Confectionery + non-US strong markets

- **Category**: K-Food → 과자/제과 (not yet covered)
- **DART**: 오리온 corp code 027660 — consolidated financials available
- **Top markets** (per 2025 IR + 디지틀조선 + econmingle reports):
  - CN $1.05B (40% of group revenue) ★★★
  - RU ~$170M (32% of overseas) ★★★
  - VN ~$130M ★★
  - KR home market
- **Why it matters**: First fixture with RU top-3. Tests sim's ability to surface Russian market on cold pure-LLM signal (no US bias to anchor on). Also no English-language K-content saturation in Russia — hard test for English-web-trained LLMs.

### 2. 라네즈 (LANEIGE) Lip Sleeping Mask ★★★ — K-Beauty Sephora flagship

- **Category**: K-Beauty → 스킨케어 (overlaps Anua but different channel)
- **DART**: 아모레퍼시픽 corp code 090430 — region segment in IR
- **Top markets**:
  - US (Sephora exclusive launch 2017, expanded to Amazon/Kohl's) ★★★
  - CN (declining post-2020 but still top-2) ★★
  - JP ★★
  - SEA (TW/SG/MY/TH) emerging
- **Why it matters**: Tests Sephora-channel anchoring (different from Amazon/iHerb anchors that drive Anua). Direct A/B against Anua for K-Beauty channel detection.

### 3. CJ 햇반 (Hetbahn instant rice) ★★ — K-Food + diaspora-driven US market

- **Category**: K-Food → 즉석밥/HMR (not covered; Bibigo is frozen dumplings)
- **DART**: CJ제일제당 (same as Bibigo, corp code 097950) but different segment
- **Top markets**:
  - US (Korean diaspora dominant, growing mainstream via Costco) ★★★
  - JP ★★
  - CN ★
- **Why it matters**: Different from Bibigo within same parent — tests whether sim picks up product-level differentiation when scale/region anchor is shared. Stress-test for F.1-A scale anchor (CJ 29T) without mass-market US prior collapse.

### 4. 롯데제과 빼빼로 ★★ — K-Confectionery + global Pepero Day cultural export

- **Category**: K-Food → 과자/제과 (with 초코파이, gives 2 confectionery datapoints)
- **DART**: 롯데웰푸드 corp code 280360
- **Top markets**:
  - CN ★★★ (largest overseas)
  - PH ★★ (top per-capita consumption)
  - MY/ID ★★
  - US (Costco) ★
- **Why it matters**: Pepero Day (11/11) is a Korean cultural export — tests sim's cultural-event anchoring. PH top-2 is unusual and tests against Comtrade aggregate ceiling.

### 5. 메디힐 마스크팩 ★ — K-Beauty mask-pack subcategory

- **Category**: K-Beauty → 마스크팩 (separate from Anua/COSRX toner-based)
- **DART**: L&P코스메틱 (unlisted? — check; may need IR-only source) or 엘앤피코스메틱
- **Top markets**:
  - CN ★★★ (still dominant despite 2017-2020 K-Beauty pullback)
  - JP ★★
  - SEA (TH/VN/ID) ★★
  - US emerging
- **Why it matters**: Mask-pack category test (different from skincare). Tests whether sim correctly identifies CN-first when 한한령 narrative is present but actual sales remain CN-heavy.

## Selection alternatives (not recommended for first batch)

- **삼양식품 까르보 불닭** — same brand as buldak (already in set), too redundant
- **닥터자르트** — Estée Lauder acquisition complicates IR signal
- **이니스프리** — declining brand, ground truth noisier
- **CJ 비비고 김치** — same Bibigo brand, only product variant differs

## Effort estimate per fixture

- Top-3 country research from IR + 농식품수출정보: ~30 min
- Ground truth JSON authoring (matching existing schema): ~15 min
- Validation against scoring pipeline: ~5 min
- **Total: ~1 hour per fixture × 5 = ~5 hours**

## Next steps after fixture authoring

1. Add 5 JSON files under `validation/ground-truth/`
2. Decide TUNING vs HOLDOUT assignment per [[calibration_framework]] — recommend at least 3 of the 5 in HOLDOUT to keep TUNING/HOLDOUT ratio honest
3. Spawn ensemble per new fixture (~$25 each × 5 = ~$125)
4. Re-run `benchmark.ts --single` for n=15 single benchmark
5. If mean stays in 70+ range, claim Phase F.1 close + start Phase F.2 (per-LLM weighting + regulatory anchor)

## Sources cited

- 오리온 매출/RU 비중: [econmingle](https://econmingle.com/economy/orion-choco-pie-russia-revenue-2000-billion/), [smartbizn](https://www.smartbizn.com/news/articleView.html?idxno=140511)
- 오리온 글로벌 구조: [newspim](https://www.newspim.com/news/view/20260430001130)
- 라네즈 Sephora 진입: [Wikipedia LANEIGE](https://en.wikipedia.org/wiki/Laneige)
- 농심 미국 K-라면 수출: [dealsite](https://dealsite.co.kr/articles/151579)
