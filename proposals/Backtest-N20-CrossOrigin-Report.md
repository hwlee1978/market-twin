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
**6/11 (55%)**. Confidence is not yet well-calibrated to accuracy — the system
is confident on the "obvious" pick even when the real answer is non-obvious.

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
