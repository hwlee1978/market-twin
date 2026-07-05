# Market Twin — N=20 Cross-Origin Backtest (honest, hindsight-controlled)

**Date:** 2026-07 · **Author:** ㈜미스터에이아이

Extends the earlier 6-brand K-Beauty backtest to a larger, more diverse,
origin-agnostic corpus. Every fixture is reconstructed at its decision point
with hindsight blocked, and the ground truth is the **first SUSTAINED /
largest overseas market** (revenue + longevity), not merely the first market
entered. Only fixtures whose outcome falls **within Market Twin's 24 supported
markets** are scored (an unsupported answer, e.g. Sweden/Nigeria, is
out-of-scope and excluded).

## 0. Headline

| Metric | Result | vs random (~10%, 10 candidates) |
|---|---|---|
| **Top-3 shortlist** (winning market in model's top 3) | **75%** (15/20) | — |
| Top-2 | 55% (11/20) | — |
| **Top-1 recommendation** | **45%** (9/20) | ~4.5× |

**Scope:** N=20 · **11 origin countries** · 5 categories (beauty / food /
beverage / wellness / electronics) · decision points 1968–2021.

The honest read: Market Twin compresses 24 candidate markets to a **top-3
that contains the eventual winner 75% of the time**, and its single headline
pick is right **45%** (4.5× better than chance). We disclose the misses and
the two systematic weaknesses below rather than curating a favorable subset.

## 1. Methodology

- **Decision-point vintage descriptions** — only information public at the
  decision quarter; no post-hoc facts about where the brand later won.
- **`--as-of` anchor backdating** — Comtrade / World Bank / customs / filings
  fetched as of the decision date (best-effort; Tavily/Hofstede are latest).
- **Ground truth = first SUSTAINED major overseas market**, verified by
  revenue/longevity with 2–3 sources per brand. "First entered" ≠ "first won"
  (e.g. a brand that entered the UK but exited is not a UK success).
- **In-scope only** — the outcome market must be one of the 24 supported
  markets; out-of-scope answers are excluded, not scored as misses.
- **Config** — hypothesis tier, 3 sims × 200 personas × multi-LLM
  (anthropic + openai + deepseek), origin-agnostic grounding, quality-aware
  aggregation + grounding-coverage confidence cap.

## 2. Results (per brand)

| Brand | Origin→Actual | Top-1 pick | Conf | Top-3 | Rank | Hit |
|---|---|---|---|---|---|---|
| Kundal | KR→ID | ID | WEAK | JP,ID,VN | 2 | ✓ |
| Five Guys | US→GB | GB | WEAK | US,GB,AU | 2 | ✓ |
| shiro | JP→TW | TW | STRONG | JP,TW,US | 2 | ✓ |
| Wardah | ID→MY | MY | STRONG | MY,TH,AE | 1 | ✓ |
| Jinro | KR→JP | JP | STRONG | KR,JP,US | 2 | ✓ |
| Kleannara | KR→SG | SG | STRONG | SG,ID,VN | 1 | ✓ |
| Native | US→CA | CA | MODERATE | CA,AU,GB | 1 | ✓ |
| OldTown | MY→SG | SG | STRONG | MY,SG,TW | 2 | ✓ |
| Anker | CN→US | US | STRONG | US,CA,DE | 1 | ✓ |
| Medicube | KR→US | TW | STRONG | KR,TW,SG | 5 | ✗ |
| Meet More | VN→KR | US | STRONG | US,KR,TW | 2 | shortlist |
| Yopokki | KR→JP | CN | MODERATE | US,VN,JP | 3 | shortlist |
| Pocky | JP→TH | TW | MODERATE | TW,US,TH | 3 | shortlist |
| Bulk Homme | JP→TW | KR | STRONG | KR,TW,US | 2 | shortlist |
| Krating Daeng | TH→SG | MY | STRONG | MY,ID,VN | 4 | ✗ |
| IRVINS | SG→HK | MY | WEAK | SG,MY,TW | 5 | ✗ |
| Oishi | PH→CN | MY | STRONG | PH,MY,VN | 10 | ✗ |
| Tony's | NL→US | GB | WEAK | NL,GB,US | 3 | shortlist |
| Shake Shack | US→AE | GB | WEAK | GB,KR,SG | 7 | ✗ |
| Kopiko | ID→PH | MY | MODERATE | ID,MY,PH | 3 | shortlist |

- **Top-1 hits (9):** Kundal, Five Guys, shiro, Wardah, Jinro, Kleannara,
  Native, OldTown, Anker.
- **Top-3 (not top-1) hits (6):** Meet More, Yopokki, Pocky, Bulk Homme,
  Tony's, Kopiko.
- **Full misses (5, actual outside top-3):** Medicube, Krating Daeng, IRVINS,
  Oishi, Shake Shack.

## 3. Honest findings (two systematic weaknesses)

**(a) Overconfidence.** STRONG-labeled recommendations were right only
**6/11 (55%)**, and the labels were barely monotonic with accuracy (MODERATE
25%, WEAK 40%). Confidence keyed off the winner's absolute vote share alone.

*Fix shipped (2026-07):* a STRONG label now additionally requires the winner
to **dominate** — cross-provider agreement AND a ≥25pp vote-share margin over
#2 — not just clear an absolute threshold (ensemble.ts). This ties confidence
to the same dominance signals already trusted for the single-vs-top2 display,
and directly removes the single-provider / thin-margin plurality cases that
drove the 55%. By construction it makes STRONG more selective (higher
precision); a full accuracy re-measure is pending the live outcome corpus, as
the historical ensembles are not all retained for a clean re-score.

**(b) Proximate-market bias.** Misses systematically pick a **geographically
/ culturally proximate or larger** market: Medicube→TW (not US), Meet
More→US, Oishi→MY (not CN), Shake Shack→GB (not AE), Krating Daeng→MY (not
SG). The grounding (Comtrade origin→partner trade flow, cultural-fit, market
size) rewards neighbors and large economies, so the true winner is pushed to
rank 2–3. This is the primary lever suppressing top-1 accuracy — and the top
product-improvement target.

## 4. Limitations (disclosed)

- N=20 is a case-study corpus, not a statistical population; CIs are wide.
- Some fixtures pre-date rich anchor coverage (1968–1990s) → thin grounding
  → confidence auto-capped (grounding-coverage cap working as intended).
- Ground truth is "first sustained market" by public reporting; some brands
  have more than one durable market (medium-confidence labels noted).
- True production accuracy is measured separately via the live outcome corpus.

## 5. Reproducibility

Fixtures + run harness:
- `scripts/backtest50-pilot-seed.ts` (6), `backtest50-batch2-seed.ts` (14),
  `backtest50-batch3-seed.ts` (2 in-scope replacements)
- `scripts/smoke-ensemble-e2e.ts <project_prefix> hypothesis --as-of=YYYY-MM-DD`

Each fixture carries decision-point, vintage description, candidate set, and
verified `actual` outcome (ground truth, never fed to the sim).

## 6. Bias-correction A/B experiment (negative result, informative)

The proximate-market bias (§3b) traced to `FINAL_SCORE_WEIGHTS.marketSize =
0.30` (2× any other component). Hypothesis: down-weighting size/proximity and
up-weighting brand-specific fit would surface non-obvious winners.

Variant tested on all 20 brands: marketSize 0.30→0.20, culturalFit 0.15→0.10,
channelMatch 0.15→0.25, priceCompat 0.10→0.15.

| | Baseline | Variant | Δ |
|---|---|---|---|
| Top-1 | 45% (9/20) | 25% (5/20) | **−4** |
| Top-3 | 75% (15/20) | 45% (9/20) | **−6** |

**Result: the variant is decisively worse — reverted.** Every changed pick
degraded. Conclusion: the current calibration (marketSize 0.30, from the
Buldak validation) is near-optimal; the market-size / cultural-fit signals are
genuinely more predictive than the noisier channel/price-fit components.

**Implication:** the proximate-market bias is NOT a re-weighting problem —
top-1 45% / top-3 75% is close to the ceiling of what the current signal set
can achieve. Predicting non-obvious, brand-specific wins (Shake Shack→UAE,
Oishi→China) requires **new brand-specific GTM signals** (founder network,
distribution deals, diaspora, category-KOL depth), not re-tuned weights. That
is the real accuracy roadmap — consistent with the "anchor blind spot"
identified in the earlier K-Beauty postmortem.

## 7. Shipped fix — live per-country demand signal (forward-looking)

The §3b proximate-market bias — the primary top-1 suppressor — now has a
shipped countermeasure: a **live per-country social / search demand anchor**
(DataForSEO absolute Google search volume + TikTok hashtag views / creator-
region distribution), injected into the country ranker as a demand axis
separate from market size.

It is **live-only by design**: present-day demand reflects the present, so it
is gated OFF for this hindsight-controlled backtest (enabling it would leak the
outcome). The N=20 numbers above are the macro-engine baseline and are
**unchanged** by this feature.

To gauge the fix's *direction* we ran the live signal over the 5 full misses
(actual outside the macro top-3) and asked whether present demand points at the
true winner. This is **forward-signal validation, not a re-scored backtest** —
it is circular by construction (a brand searches high where it later won), so
read it as "does the live signal align with real winners," not as an accuracy
number.

| Miss | Actual | Live-signal rank | Recovered? |
|---|---|---|---|
| Medicube | US | #1 (search 301K/mo) | ✅ |
| Krating Daeng | SG | #5 (ID leads, 33K/mo) | ❌ |
| IRVINS | HK | outside top-3 (SG/ID lead) | ❌ |
| Oishi | CN | — (China invisible; generic name) | ❌ |
| Shake Shack | AE | #5 (GB/JP lead) | ❌ |

**Only 1 of 5 misses recovers the true winner (Medicube→US).** This is a
*correction*: an earlier draft reported 3/5, but that was an artifact of a
DataForSEO batching bug (multi-task requests silently returned only the first
country's search volume, so the other markets fell back to social signals and
appeared to "recover"). With correct per-country absolute search volume, the
signal points at whichever market is **largest by current search**, which for
globally-viral brands is a big present-day market (US/ID/GB), **not** the small
historical first-win market (HK/AE/SG). Absolute search volume carries its own
size/circularity bias.

**Honest conclusion:** the live per-country demand signal (search volume +
trajectory + TikTok) is a genuine **new grounding axis for live launch
decisions** — "where is demand now, and is it rising" — but it is **not a
reliable back-test-miss fixer**. It recovers a miss only when the true winner
is also the largest current-search market. The remaining misses need
market-specific GTM signals (§6) and China-domestic data (§ below), not search
volume alone.
