# v0.1 ship readiness — honest reframe

Drafted 2026-05-18 after the v7→v9 sample-expansion arc exposed that v7's
mean 72.0 was 6-fixture overfit. v9 n=15 measurement gave mean **58.7** —
the honest reality at production sample size.

This document replaces the implicit "ship when gate ≥80" framing with a
realistic launch path acknowledging today's measurement state.

## Today's honest measurements (post-v10)

| Sample | Mean composite | HOLDOUT mean | TUNING mean | Notes |
|---|---|---|---|---|
| v7 (n=6) | 72.0 ✓p=0.0086 | 75.4 (n=2) | 70.4 (n=4) | 6-fixture US-top-biased |
| v8 (n=10, KOTRA v1) | 65.7 | 62.3 (n=3) | 67.1 (n=7) | + 4 fixtures, KOTRA US-prior bias surfaced |
| v8b (n=10, KOTRA v2+MFDS) | 67.3 | — | — | KOTRA cap partial fix, MFDS BoJ +5.6 |
| **v9 (n=15)** | **58.7** | **51.7 (n=8)** | **66.7 (n=7)** | **5 new HOLDOUT, US-prior dominant on CN/JP/RU truths** |
| v10 (K-Food/Alcohol KOTRA off, n=8 re-spawn) | ~mean Δ 0 | — | — | jinro +25 / binggrae -24 / others mixed |

**v0.1 launch will be measured against v9-class samples (n=15+), not v7-class (n=6).**

## What we ship anyway (honest disclosure)

v0.1 ships with **mean 55-65 advisory accuracy, clearly labeled as advisory not production**. The user-facing surface acknowledges:

- top3Hit averages 60-70% (3 of 5 markets correctly identified, roughly)
- rankCorrelation ~0.7 (rough ordering, not perfect)
- confidentially STRONG calls on US-top truths (≥80% accuracy)
- frequent miss on CN/JP/RU-top truths (sim US-prior persistent)
- explicit "advisory only" badge until outcome-feedback corpus accumulates

## Ship readiness criteria (revised)

### Tier 1 — Closed beta (current target)
- Signup flag still gated (NEXT_PUBLIC_SIGNUP_ENABLED=false)
- Founder-invited pilot customers only
- Every report carries "advisory not production" disclaimer
- 5-metric scorecard shown to user with current per-fixture accuracy
- Real-world outcome capture form active (per [[outcome-feedback-design]])
- **Trigger**: complete now. No further accuracy gate.

### Tier 2 — Paid public beta
- Mean composite ≥65 stable over 30 days
- 5+ paid pilots completed
- Outcome-feedback corpus ≥50 rows
- Trust page accuracy disclosure shows live numbers (not 72 marketing)
- **Trigger**: Q3 2026 (need outcome-feedback ship + first cohort)

### Tier 3 — Marketing-visible accuracy claim
- Mean composite ≥75 stable, HOLDOUT ≥ TUNING - 5pt (no overfit)
- 500+ outcome rows
- Per-fixture accuracy distribution disclosed (not just mean)
- **Trigger**: 2027 (gated on outcome feedback maturity)

## Honest reframe of public materials

### Before (v4.5 sales claim)
"v7 mean 72.0, paired p=0.0086, HOLDOUT 75.4 — first stat-significant Phase F win"

### After (v0.1 launch claim)
"15-product benchmark mean 58.7. Per-fixture variance: US-top fixtures
60-95 (strong), CN/JP/RU-top fixtures 4-55 (weak). Detailed scorecard
in every report. Advisory tier — paid pilot trains the outcome corpus
that will lift accuracy past 75 over 2026-2027."

This is harder to sell short-term, but it's defensible long-term and
matches the audit governance disclosure on /trust page.

## What this means for marketing

Pages that need update (separate marketing repo, user will edit):
- **/methodology**: Phase F.2/F.3 cards (user already flagged) — replace
  with current state (MFDS narrow ship + DART auto-parser shipped)
- **/trust**: Replace "approaching gate" with explicit "v9 mean 58.7"
- **Sample report PDF**: Refresh with current quality numbers, not v7
  cherry-picked examples
- **1-pager (KO/EN)**: Replace v7 sales numbers with honest v9 + path

## What this means for business plan

v4.5 currently quotes v7 mean 72.0 as primary accuracy claim. v4.6
candidate refresh:
- §4.4.7 Phase F.1 dramatic win section → reframe as **partial win at
  small sample**, with v9 honest reality (n=15) section appended
- §9.2 KPI table → revise "gate ≥80" path to 2-tier (v0.1 advisory at
  ~60 / production at ~75 + outcome corpus)
- §12.1 verification disclosure → cite v9 numbers, not v7

## What this means for accuracy work (no more 80-by-anchors)

[[anchor_design_lessons]] failure mode #5 plus the v10 mixed result confirm
that **the anchor stack is at its ceiling around mean 60-70 at n=15+**. The
remaining levers are:

1. **Outcome feedback corpus** ([[outcome-feedback-design]]) — paths to 75-85
2. **Per-LLM weighting refresh** — F.2 design exists, awaiting post-anchor
   ensemble corpus (>30 anchor-active runs)
3. **More fixture-tuned region tables** — explicitly forbidden by user
   ("per-fixture toggle은 말이 안 됨") because it doesn't generalize

DART region parser (Phase 1-7, shipped today) is the **scalable** F.1-B v2 —
covers ~3/8 multi-segment parents automatically. LLM narrative extractor
(Phase 4-5, shipped today) covers the single-segment 5/8. Together they
let any new user product get auto-anchor at ~$0.001 LLM cost + 30-day cache.

## Action items

1. ✅ Memory entry [[production-vs-fixture-tuned-anchors]] (already saved)
2. ✅ DART auto + narrative parsers shipped (commits 754dc09, 3799c93, d2ced9a, 2649897, d5324cb)
3. ⬜ Marketing site Phase F.2/F.3 card refresh (user → handles directly)
4. ⬜ Sample PDF refresh (deferred until first beta cohort)
5. ⬜ /methodology + /trust honest disclosure update (1-2h work when scheduled)
6. ⬜ Business plan v4.6 honest reframe (1-2h work when v0.1 launch nears)
7. ⬜ Outcome-feedback form implementation (when paid pilot cohort scheduled)
8. ⬜ v0.1 launch banner/badge: "Advisory tier — measured accuracy 55-65 at n=15"

## Cross-references

- [[v9_n15_honest_reality]] — the measurement that triggered this reframe
- [[production-vs-fixture-tuned-anchors]] — user critique that exposed the issue
- [[anchor_design_lessons]] — failure mode #5 (small-sample illusion)
- [[outcome-feedback-design]] — the long-term ceiling-break path
- repo: validation/results/PHASE_F_TRAJECTORY.md
- repo: proposals/MarketTwin_BusinessPlan_v4_5.md (next: v4.6 honest)
