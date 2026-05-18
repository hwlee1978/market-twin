# Anchor design lessons (Phase F)

Drafted 2026-05-18 after v8 diagnostic. Mandatory pre-read before adding any
new external grounding anchor (Phase F.2 per-LLM weighting, aT 농식품수출정보,
EU Cosing, etc.). Captures failure modes from v0→v8.

## Why this exists

Phase F added 7 anchors (Hofstede / World Bank / UN Comtrade / 관세청 / DART
scale / DART region / KOTRA), shifting mean accuracy from 40 to 72 (v7).
Sample expansion to n=10 then dropped mean to 65.7 — not because the anchors
were broken, but because a single anchor (KOTRA) was injecting systematic
US-bias that only showed up on non-US-top fixtures (jinro JP regressed -22pt).

Same family of failure happened at v6 (DART F.1-A scale-only ship pushed
sim toward mass-market US prior, Bibigo -17). The pattern repeats. This
doc is the mitigation: every new anchor must answer these questions before
ship.

## The four failure modes observed

### 1. Aggregate-count bias

**v6 DART F.1-A bare-scale, v8 KOTRA v1 raw-count exposure**.

If the anchor surfaces "this market has 430 entries vs that market has 12,"
the sim reads the raw count as market-importance signal even when category-
matched entries are equal. The 430-vs-12 difference is sometimes just dataset
coverage (US is heavily covered) not market preference.

**Mitigation**: don't surface raw counts. Cap per-country output (3-5
entries max). If you must show "X more available," do it as a single bit
("> 5 entries") not the exact number.

### 2. Coverage-asymmetry bias

**KOTRA US 430 companies vs other countries 10-30**.

Even with per-country cap, if the underlying dataset is fundamentally
unbalanced (US 40×) any keyword-matching step will land more US hits.
Hits-then-cap still ends up US-heavy.

**Mitigation**: pre-filter dataset to balance per-region density before
keyword match. Or cap keyword-matched hits separately per country before
ranking. Or hide the country with the outlier-large dataset entirely from
this anchor and serve it from a different one.

### 3. Single-side anchor amplification

**v6 DART F.1-A scale ship without F.1-B region table**.

Scale anchor ("this brand sells 29T KRW total") with no region distribution
pushes sim toward generic mass-market prior (= US for K-Beauty/K-Food).
You're giving the sim more confidence to say what it would have guessed
anyway, and that guess happens to be wrong for half the fixtures.

**Mitigation**: scale-style anchors MUST ship paired with distribution-style
anchors. Don't ship F.X-A without F.X-B.

### 4. Narrow-data masquerading as broad anchor

**MFDS cosmetic regulation initial pitch**.

Pitched as "regulatory anchor for K-Beauty," it turned out the underlying
dataset is dominated by regulated functional ingredients (UV filters,
retinol). Safe skincare actives (Centella, snail mucin, niacinamide) have
no MFDS entries because they're globally unregulated. Forcing this anchor
across all K-Beauty fixtures would inject empty/irrelevant signal on 14 of
15, with noise risk identical to KOTRA US-heavy pattern.

**Mitigation**: measure fixture coverage *before* wiring. If <30% of
fixtures get any signal, scope the anchor narrowly (category-only opt-in)
rather than running it everywhere.

### 5. Small-sample illusion of progress

**v7 → v8 → v9 sample-expansion trajectory**.

v7 reported mean composite **72.0** at n=6 with **HOLDOUT 75.4 > TUNING 70.4**,
read as "real generalization." v8 (n=10) and v9 (n=15) progressively
exposed it: v9 mean **58.7** with **HOLDOUT 51.7 < TUNING 66.7 (-15pt)**.
The original 6 fixtures were heavily US-top (5/6); the 9 new fixtures added
across v8/v9 included CN/JP/RU/PH-top truths that the LLM US-prior could
not overcome even with the full anchor stack. Each sample expansion
revealed the anchors were grounding US-leaning categories well and
non-US-top categories poorly.

**Mitigation**:
- Generalization claims require **n ≥ 5 per split** (HOLDOUT and TUNING each)
- Don't report mean lift as evidence of progress until n ≥ 12 with a
  category-balanced split
- Anchor-stack improvements that show big lift on n=6 should be
  pre-emptively tested against a held-out n=3 non-US-top fixture set
  before being celebrated
- Flag every Phase-F-style measurement with "fixture distribution: X US-top,
  Y CN-top, Z JP/other" so the reader can mentally normalize

## Pre-ship checklist for new anchors

Copy this into the design doc for every new anchor (Phase F.2+, F.3+, ...).

```
- [ ] Sketch the per-fixture impact map (which fixtures benefit, ±0, get noise)
- [ ] Coverage gate: does ≥30% of the fixture set get a non-empty signal?
      → If NO, ship as narrow (category-only opt-in), not as a global anchor
- [ ] Per-country density check: is the underlying dataset balanced
      (max-country / mean-country ratio < 5×)?
      → If NO, normalize before keyword match, or cap differently per country
- [ ] No raw-count exposure: prompt block shows cap-N entries, NOT
      "(+X more available)" or "(total Y on registry)"
- [ ] Empty-signal beats noise: if fixture matches nothing, skip the
      block entirely (don't fill with generic content)
- [ ] Pair-test gate: smoke shows BoJ-style fixture-matched case clearly,
      AND non-matching fixture returns empty block
- [ ] A/B-toggle env flag exists (ANCHOR_NAME_ENABLED=false) so a single
      diagnostic spawn can isolate the anchor's effect if it regresses
- [ ] Documented in PHASE_F_TRAJECTORY.md table row before first spawn
```

## Concrete patterns to apply

### Per-country cap (KOTRA v2 pattern)

```typescript
const max = opts.maxPerCountry ?? 3;
// Inside per-country block rendering:
const lines = scoredAndFiltered.slice(0, max).map(formatLine);
// NO "X more" suffix; just the cap-N entries.
```

### Coverage gate (MFDS narrow scope pattern)

```typescript
// Only activate when the fixture has a curated mapping entry.
// brand-ingredients.json is the gate; absence means SKIP.
const entry = brands[fixtureSlug];
if (!entry || !entry.uvFilters?.length) return null;
```

### A/B toggle env flag

```typescript
if (process.env.ANCHOR_X_ENABLED === "false") {
  console.log(`[ensemble ${ensembleId}] anchor-X: disabled via env`);
} else try {
  // existing prefetch
}
```

### Empty-signal-over-noise

```typescript
// Inside per-country section building:
if (filteredCompsForCountry.length === 0) continue; // skip country
// after loop:
if (sections.length === 0) return ""; // skip whole anchor
```

## Anti-patterns to avoid

| Pattern | Why it's bad | Seen in |
|---|---|---|
| "Show all N matching companies in this country" | Country-density asymmetry leaks as a US-prior amplifier | KOTRA v1 |
| "Inject aggregate scale (revenue, count) without distribution context" | Sim doubles down on whatever generic prior it had | DART F.1-A bare |
| "If no fixture-specific data, fall back to generic regulatory note" | Sim treats generic note as positive signal (rejectRecall ↓) | (avoided in MFDS) |
| "Append every prefetched anchor to tradeAnchorBlock unconditionally" | Each empty fixture eats prompt budget without value | (still risk if not skipping) |
| "Trust 'all countries' input from API as-is" | Datasets have wildly different coverage per region | KOTRA US 430 vs others |

## Reference

Each lesson cross-links to the trajectory:
- v0→v3: Comtrade aggregate, mean noise — Phase E close baseline
- v4: Phase F.0 (Hofstede + WB), +13.7 paired Δ, first signal — see [[phase_f0_results]]
- v5: 관세청 alone, brand-mismatch ceiling — see [[v5_korea_customs_results]]
- v6: DART F.1-A scale + partial F.1-B, KGC 100/100 outlier — see [[v6_dart_first_win]]
- v7: DART full F.1-B, mean 72.0 ✓ stat-sig — see [[v7_full_region_breakthrough]]
- v8 diagnostic: KOTRA v1 noise on jinro, KOTRA cap + MFDS narrow ship (commit b936ea4)

Update this doc when v8b/v9 produce new lessons.
