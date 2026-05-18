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
| **v7 (full F.1-B)** | **2026-05-17** | **+ all-fixture region tables** | **72.0** | **+17.5** | **0.0086 ✓** | First stat-significant Phase F win, but **6-fixture overfit** (see v9). |
| v8 (KOTRA v1 added, n=10) | 2026-05-18 | + KOTRA F.1-C raw | 65.7 | (sample expansion) | — | KOTRA US-heavy bias (430 vs 10-30) noised non-US-top fixtures; jinro -22, buldak no recovery. |
| v8b (KOTRA v2 cap + MFDS narrow) | 2026-05-18 | + KOTRA cap 3 + MFDS BoJ-only | 67.3 | +1.6 (vs v8) | 0.32 | MFDS BoJ +5.6 validated; KOTRA cap partial fix. |
| **v9 (n=15 sample expansion)** | **2026-05-18** | (unchanged anchors, +5 new HOLDOUT fixtures) | **58.7** | **-8.6** | — | **Honest reality**. HOLDOUT 51.7 < TUNING 66.7 (-15pt). 4 confident_wrong all "truth CN, sim US STRONG". v7's 72 was 6-fixture US-top-friendly sample. |
| v10 (KOTRA v3 K-Food/K-Alcohol off) | in-flight 2026-05-18 | KOTRA auto-skip for food/alcohol | TBD | TBD | TBD | Re-spawn 8 K-Food/K-Alcohol fixtures; measure recovery on CN-top fixtures. |

## Per-product Δ (v6 → v7, all-region-table activation)

| Product | v6 | v7 | Δ | Win driver |
|---|---|---|---|---|
| bibigo-mandu | 30.0 | 63.3 | **+33.3** | F.1-A scale + F.1-B region reverses v6 mass-market US prior |
| lg-oled-tv-c-series | 52.4 | 84.1 | **+31.7** | 8 region rows → top3Hit 1.0 (US/DE/GB) |
| binggrae-melona | 36.7 | 66.7 | **+30.0** | VN $80M ★★★ row → sim picks VN top (Phase F.0 deepest-gap fix) |
| anua-heartleaf-toner | 55.6 | 66.7 | +11.1 | small but consistent |
| boj-relief-sun | 52.8 | 55.0 | +2.2 | noise level |
| kgc-everytime-redginseng | 100.0 | 96.4 | -3.6 | stable near ceiling |

## Anchor stack as of v9

1. **Hofstede 6D** (static, 28 countries) — cultural decision priors
2. **World Bank Open Data** — GDP per capita PPP, population, household consumption (live)
3. **UN Comtrade** — HSCode-aggregate trade flows (live, Y-2 period)
4. **관세청 OpenAPI** (data.go.kr 1220000/nitemtrade) — finer HSCode granularity
5. **DART F.1-A** (`fnlttSinglAcntAll`) — corporate scale per Korean parent
6. **DART F.1-B** (validation/reference/brand-region-revenue.json) — per-region revenue per brand
7. **KOTRA F.1-C v3** (data.go.kr B410001, commit 154db0e) — cap 3, raw counts hidden, auto-skip K-Food/K-Alcohol
8. **MFDS F.3 narrow** (data.go.kr 1471000, commit b936ea4) — sunscreen-category opt-in only (BoJ Relief Sun)
9. **Provider weights F.2 B1** (commit 198cc4c) — off by default; PHASE_F2_ENABLED=true opt-in

## Key mechanisms confirmed

### F.1-B brand-region-revenue table works for fixtures whose row exists
v6 (KGC + LG OLED only had region rows) → 1 perfect win, 1 stable, 4 mixed.
v7 (all 6 fixtures have region rows) → 4 dramatic wins, 1 stable, 0 regression.
v9 caveat: 5 new HOLDOUT fixtures all have region rows, but 3 of 5 still
land in confident_wrong because the LLM US-prior overrides the region
hint when truth is CN/JP/RU and US has any plausible secondary signal.

### F.1-A scale anchor MUST ship with F.1-B region table
- v6 Bibigo: CJ 29T scale alone pushed sim toward generic US mass-market → -17.
- v7 Bibigo: same scale + region table (US $3B, CN $0.6B) → US/CN concrete prior → +33.
- Bare-scale ship is **strictly worse** than no anchor.

### HOLDOUT > TUNING was a 6-fixture artifact, not generalization
v7 reported HOLDOUT 75.4 > TUNING 70.4 (n=2 vs 4) as a generalization signal.
v9 with HOLDOUT n=8 (5 new + 3 existing): HOLDOUT 51.7 < TUNING 66.7 (-15pt).
The v7 reading was inverted by tiny n=2 HOLDOUT happening to be BoJ + Bibigo
(both US-top, both well-handled). **Generalization claims require n≥5 per split**.

### Sample-expansion illusion — "small-sample progress" is the next anti-pattern
v7→v8→v9 mean trajectory: 72 → 65.7 → 58.7. Each sample expansion exposed
US-prior bias on the new fixtures (non-US-top CN/JP/RU truths). The anchor
stack mostly grounds US-leaning categories; for non-US-top truths it
helps modestly at best. Document this as anti-pattern #5 in
[[anchor-design-lessons]] when v10 lands.

## Pending verification (v10 in flight — superseded planning text below)

v10 (K-Food/K-Alcohol fixtures re-spawn with KOTRA v3 auto-off) is the
current measurement. Will reveal whether the 4 confident_wrong findings
from v9 (buldak, lotte-pepero, mediheal-maskpack via category bypass,
orion-chocopie) recover when KOTRA is removed from the prompt.

Expected outcomes:
- **Best case**: K-Food fixtures recover +5-30 each, n=15 mean climbs back
  to 63-68. Phase F.1 close gated on per-fixture KOTRA toggle for K-Beauty
  CN-top (mediheal).
- **Mid case**: K-Food recovery modest (+0-10), confirms the LLM US-prior
  is largely independent of KOTRA — anchor work is near its ceiling.
  Pivot to outcome-feedback path ([[outcome-feedback-design]]).
- **Worst case**: K-Food doesn't recover, means KOTRA isn't the dominant
  noise source — re-spawn with PHASE_F2_ENABLED=true to test provider
  weighting in combination.

## v0.1 ship readiness mapping (revised after v9)

| Mean composite (n=15+) | Reading |
|---|---|
| <40 | Pre-Phase-E baseline |
| 40-55 | Phase E close range — direction-correct but not production |
| **55-65** | **v9 honest reality** — top3 mostly right on US-top fixtures, frequently miss on CN/JP/RU-top fixtures. Usable for advisory + clearly-labeled caveats. |
| 65-75 | Anchor stack at its ceiling. Per-fixture toggles + per-LLM weighting + outcome feedback bootstrap required to climb further. |
| 75-85 | Outcome-feedback corpus (50-500 rows) actively shifting GT. Paid pilot ready. |
| 85+ | Marketing-visible accuracy commitment after 1,000+ outcome rows. |

**v9 reading**: n=15 mean **58.7** lands in the new "v9 honest reality" band.
HOLDOUT 51.7 < TUNING 66.7 confirms the v7 6-fixture sample was US-top-biased.

**Path to gate** (revised):
- v10 KOTRA v3 effect: ±0-5 estimate
- per-fixture KOTRA toggle + F.2 weight refresh + MFDS broader: ±0-10 cumulative
- That maxes at maybe mean 65-70 within anchor work alone
- The 70→85 leap requires the outcome-feedback loop ([[outcome-feedback-design]])
- v0.1 ship can target **mean 65 honest, labeled as advisory not production**
