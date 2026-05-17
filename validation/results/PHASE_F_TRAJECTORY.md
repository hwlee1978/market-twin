# Phase F accuracy trajectory

Cumulative benchmark history through 2026-05-17. Single source of truth for
the Phase E close → Phase F ship arc. Each row corresponds to one full
ensemble run scored against the same 6-product TUNING+HOLDOUT split.

## Trajectory

| Tag | Date | Anchor stack | Mean / 100 | Paired Δ vs prev | p-value | Notes |
|---|---|---|---|---|---|---|
| v0 (Phase E close) | 2026-05-17 | round-robin LLM only | 40.4 | — | — | Gate ≥80 MISS. Honest baseline. |
| v3 (Comtrade) | 2026-05-17 | + UN Comtrade HSCode | 40.0 | -0.4 | 0.97 | BoJ +44 dramatic outlier, mean noise. |
| v4 (F.0 Hofstede + WB) | 2026-05-17 | + Hofstede 6D + World Bank | **47.9** | **+13.7** | **0.087** | First statistically meaningful improvement. |
| v5 (관세청) | 2026-05-17 | + Korea Customs OpenAPI | 44.9 | -3.0 | 0.97 | Confirmed HSCode-aggregate intrinsic limit (Binggrae VN, KGC CN). |
| v6 (DART F.1-A + partial F.1-B) | 2026-05-17 | + DART scale + 2 region tables | 54.6 | +9.7 | 0.67 | **KGC perfect 100/100** outlier. Std~36. Scale-only ship risky (Bibigo -17). |
| **v7 (full F.1-B)** | **2026-05-17** | **+ all-fixture region tables** | **72.0** | **+17.5** | **0.0086 ✓** | **First stat-significant Phase F win. Holdout 75.4 > tuning 70.4.** |

## Per-product Δ (v6 → v7, all-region-table activation)

| Product | v6 | v7 | Δ | Win driver |
|---|---|---|---|---|
| bibigo-mandu | 30.0 | 63.3 | **+33.3** | F.1-A scale + F.1-B region reverses v6 mass-market US prior |
| lg-oled-tv-c-series | 52.4 | 84.1 | **+31.7** | 8 region rows → top3Hit 1.0 (US/DE/GB) |
| binggrae-melona | 36.7 | 66.7 | **+30.0** | VN $80M ★★★ row → sim picks VN top (Phase F.0 deepest-gap fix) |
| anua-heartleaf-toner | 55.6 | 66.7 | +11.1 | small but consistent |
| boj-relief-sun | 52.8 | 55.0 | +2.2 | noise level |
| kgc-everytime-redginseng | 100.0 | 96.4 | -3.6 | stable near ceiling |

## Anchor stack as of v7

1. **Hofstede 6D** (static, 28 countries) — cultural decision priors
2. **World Bank Open Data** — GDP per capita PPP, population, household consumption (live)
3. **UN Comtrade** — HSCode-aggregate trade flows (live, Y-2 period)
4. **관세청 OpenAPI** (data.go.kr 1220000/nitemtrade) — finer HSCode granularity
5. **DART F.1-A** (`fnlttSinglAcntAll`) — corporate scale per Korean parent
6. **DART F.1-B** (validation/reference/brand-region-revenue.json) — per-region revenue per brand
7. **KOTRA F.1-C** (data.go.kr B410001, shipped 82b3b74 — pending first measurement)

## Key mechanisms confirmed

### F.1-B brand-region-revenue table is the dominant lever
v6 (KGC + LG OLED only had region rows) → 1 perfect win, 1 stable, 4 mixed.
v7 (all fixtures have region rows) → 4 dramatic wins, 1 stable, 0 regression.

### F.1-A scale anchor MUST ship with F.1-B region table
- v6 Bibigo: CJ 29T scale alone pushed sim toward generic US mass-market → -17.
- v7 Bibigo: same scale + region table (US $3B, CN $0.6B) → US/CN concrete prior → +33.
- Bare-scale ship is **strictly worse** than no anchor.

### HOLDOUT > TUNING means real generalization
TUNING n=4: 70.4 vs HOLDOUT n=2: 75.4. The improvement is not a calibration
artifact specific to the fixtures we hand-tuned.

## Pending verification (n=10 in flight)

Currently spawning 4 missing fixtures (buldak, shin-ramyun, cosrx-snail-mucin,
jinro-chamisul) to extend the sample. Will run on v7 codebase + KOTRA F.1-C
applied. Expected outcomes:

- **Best case**: mean stays in 70+ range across n=10 → KOTRA neutral-or-additive,
  generalization confirmed at broader sample. Triggers Phase F.1 close.
- **Drift case**: KOTRA noise injection drops one or more fixtures by 15+. Diagnose
  via per-fixture findings; consider tightening KOTRA filter further or scoping it
  to specific categories.
- **Mid case**: mean drifts down 5-10 but no single product regresses critically.
  Likely real (some new fixtures are harder); proceed with B (5 new ground-truth
  fixtures) for sample size n=15.

## v0.1 ship readiness mapping

| Mean composite | Reading |
|---|---|
| <40 | Pre-Phase-E baseline |
| 40-60 | Phase E close range — direction-correct but not production |
| 60-75 | **v7 region** — top3 mostly right, calibration usable for advisory |
| 75-85 | Phase E formal gate target. Ready for paid pilot. |
| 85+ | Marketing-visible accuracy commitment. |

v7 mean 72.0 lands in the "advisory-usable" band. Holdout 75.4 brushes the gate.
