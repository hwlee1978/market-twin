# Phase F.2 design — Per-LLM × category trust weighting

Drafted 2026-05-18 after v8 diagnostic. Pre-impl design doc; await v8b results
before scheduling. Replaces the implicit round-robin assumption that all 3
providers are equally trustworthy on every category.

## Current state

Decision tier (post-#9 fix, shipped 2026-05-16) spawns 6 sims split 2-2-2
across Anthropic / OpenAI / DeepSeek per ensemble. Each provider's vote
counts equally in the Phase E mean-rank winner picker.

## Hypothesis

External anchors (Phase F.0-F.1) reduced provider-specific bias but didn't
eliminate it. Some categories (K-Beauty US, K-Food Asia, K-Tech mainstream)
still show provider-skew patterns visible in [[per-provider-bias-diagnostic]].
After Phase F.1 stack lands, residual bias becomes the highest-leverage
remaining target.

## Why this is a Phase F item, not Phase E

Per [[per-provider-bias-diagnostic]] conclusion: "Don't reorder round-robin
weights before Week 4-5 external anchor work. Without anchor data, you're
just shuffling biases, not removing them." Phase F.1 ship completed
2026-05-17. Now is the right time.

## Pre-ship checklist (per anchor-design-lessons)

| Check | Status | Notes |
|---|---|---|
| Per-fixture impact map | ⏳ | Need v8b/v9 baseline first — current data v2 (pre-anchor) outdated |
| Coverage gate (≥30% fixtures affected) | ⏳ | Likely passes — every fixture has 6 sims × 3 providers |
| Density check | N/A | Not an external anchor, internal weighting |
| No raw-count exposure | ✓ | Weighting is on score aggregation, no prompt-level signal |
| Empty-signal-over-noise | ✓ | Fallback to uniform when category unknown/insufficient data |
| A/B env flag | TBD | `PER_LLM_WEIGHTING_ENABLED=false` (default off until 30+ ensemble data) |
| Smoke positive AND empty case | TBD | Build alongside |
| Trajectory table entry | ⏳ | Add to PHASE_F_TRAJECTORY.md when ready |

## Three weighting algorithm candidates

### A. Per-category fixed weights (simple, low-evidence)

Hard-coded per-category trust matrix from [[per-provider-bias-diagnostic]]:

```typescript
const CATEGORY_WEIGHTS: Record<string, Record<Provider, number>> = {
  "K-Beauty":   { anthropic: 0.7, openai: 0.8, deepseek: 1.5 }, // DeepSeek best on US
  "K-Food":     { anthropic: 1.4, openai: 0.8, deepseek: 0.8 }, // Anthropic closer to Asia
  "K-Wellness": { anthropic: 1.0, openai: 1.2, deepseek: 1.0 },
  "Appliances": { anthropic: 1.0, openai: 1.2, deepseek: 1.0 },
  // Default for unknowns:
  "_default":   { anthropic: 1.0, openai: 1.0, deepseek: 1.0 },
};
```

**Pros**: trivial to implement; deterministic; easy A/B.
**Cons**: hand-tuned magic numbers (violates calibration framework); brittle
when new categories arrive; doesn't update as anchors improve providers.

### B. Per-ensemble accuracy-weighted (data-driven, requires history)

Aggregate per-provider × per-category historical accuracy from `simulations`
table. Compute weight = recent-N-runs precision per category. Apply in
mean-rank winner picker.

```typescript
const weight = await computeProviderWeight({
  provider,
  category: projectInput.category,
  lookbackDays: 90,
  minSamples: 5,
});
// fallback: 1.0 if insufficient samples
```

**Pros**: self-tuning; honors calibration framework principle (data > magic
numbers); auto-adapts as anchors improve providers.
**Cons**: needs ground truth per ensemble (already have for 15 fixtures);
cold-start problem for new categories; complexity in winner picker logic.

### C. Category-aware tournament (most complex)

Each ensemble's per-country score aggregation runs per-provider, then a
meta-evaluator (1 extra LLM call) picks the most-trusted-provider's slate
per category.

**Pros**: most principled — meta-evaluator can reason about category context.
**Cons**: +1 LLM call per ensemble (cost+latency); meta-evaluator itself
has bias; harder to debug "why this country was picked."

## Recommended path

**B + fallback to uniform.** Start with B (data-driven) for categories with
≥5 historical samples, fall back to uniform (current behavior) otherwise.

Implementation phases:
- B1: ship aggregation query + weight computation (no winner picker changes)
- B2: A/B spawn comparing uniform vs weighted on existing fixtures
- B3: ship weighted as default if B2 shows ≥5pt mean improvement at p<0.10

## Per-fixture expected impact

Based on [[per-provider-bias-diagnostic]] v2 patterns (need refresh post-F.1):

| Category | Fixture examples | Expected weight effect |
|---|---|---|
| K-Beauty (truth US) | Anua, COSRX, BoJ | +3-8pt if DeepSeek over-weighted |
| K-Food (truth CN/JP) | Bibigo, Melona, Buldak | +3-8pt if Anthropic over-weighted |
| K-Wellness | KGC | ±0 (already ensemble agreement) |
| K-Tech | LG OLED | ±0 (all providers right) |
| K-Alcohol | Jinro | unclear (single fixture data) |

**Net expected lift**: +3-6pt mean across n=15, with K-Beauty and K-Food
carrying most of it.

## Risks specific to F.2 (vs F.0-F.1 anchors)

1. **Overfit to current 15-fixture distribution** — weights tuned on this
   set may degrade on new categories (jewelry, K-Pharma, etc.).
   Mitigation: enforce `minSamples=5` cold-start fallback.
2. **Confidence calibration drift** — weighted aggregation may produce
   tighter consensus that doesn't reflect actual accuracy.
   Mitigation: track `consensusType` separately (cross-model vs single-provider).
3. **Hidden coupling with KOTRA fix** — if KOTRA US-heavy bias affected
   per-provider differently, post-cap measurements may show different
   bias patterns than pre-cap.
   Mitigation: rebuild bias diagnostic on v8b/v9 data before tuning weights.

## Cost

- Implementation B1+B2: ~2 days dev
- A/B spawn (n=15): ~$125
- Total: ~$130 + 2 days

## Decision gates

- **Gate 1 (start B1)**: v8b shows KOTRA cap + MFDS stabilizes mean ≥65,
  confirming Phase F.1 anchor stack is settled.
- **Gate 2 (ship B3)**: A/B shows ≥+5pt mean at p<0.10 OR per-provider
  diagnostic shows >2× variance reduction.
- **Skip F.2 entirely if**: v8b mean ≥75 already (then provider-bias is
  small-leverage; pursue F.3 regulatory expansion or sample expansion instead).

## When to revisit

After v8b/v9 results + 30+ total ensembles in database (enough samples for
B's per-category-per-provider statistics). Rebuild
[[per-provider-bias-diagnostic]] matrix on post-Phase-F.1 data before
finalizing weights.

Related: [[per-provider-bias-diagnostic]] [[anchor-design-lessons]]
[[v7-full-region-breakthrough]] [[v8-kotra-noise-diagnosis]]
