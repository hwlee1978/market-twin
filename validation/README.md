# Ground Truth Validation Dataset

This directory holds the **ground truth dataset** that the simulation accuracy
benchmark scores against. Every file under `ground-truth/` conforms to the
schema in `packages/shared/src/validation/schema.ts` and is loaded by
`packages/shared/src/validation/loader.ts`.

## Governance rules

These rules exist so the benchmark is honest. Bypassing them silently makes
the accuracy number a liar.

### 1. Ground truth must lock *before* the sim runs

Never edit a ground truth file after looking at a simulation that hasn't been
scored yet. If you do, you've fit ground truth to the model — the benchmark
becomes a tautology. Edit history (git log) is the audit trail.

### 2. Source provenance is mandatory

Every `evidence` row requires:
- `source.type` — picked from the enum (IR > trade_data > market_research > industry_report > trade_news > company_press_release > general_news > academic), in decreasing evidentiary weight
- `source.accessedAt` — ISO date the fact was retrieved
- `confidence` — `high` / `medium` / `low`

Confidence is **not** declared on the product. It is declared per evidence
row, and the product's effective confidence is *derived* downstream from the
mix of its rows.

### 3. `asOf` matters

Per-evidence `asOf` records *when the fact was true*. Sim runs in 2026 cannot
be scored against a 2019 IR rank without acknowledging the gap. The benchmark
warns when sim.asOf and evidence.asOf differ by > 18 months.

### 4. Split must align with calibration framework

`split: "TUNING"` — used for both `informedByRuns` in calibration anchors AND
benchmark training/regression detection. Tuning anchors are allowed to fit
these.

`split: "HOLDOUT"` — must improve when calibration changes, but no anchor is
allowed to cite a HOLDOUT product in its `informedByRuns`. If the benchmark
shows holdout regression while tuning improves, the anchor is overfit.

The split must match the entry in
`packages/shared/src/simulation/calibration/provenance.ts` for every product
referenced there. Mismatches are caught by `scripts/validation-status.ts`.

### 5. Leakage flag is not a disqualifier — it changes interpretation

`leakageRisk.inTrainingData: true` means the LLM may have *recalled* the
right answer instead of *reasoned* it. A confident-correct answer on a
high-leakage product is weaker evidence than the same answer on a low-leakage
product. The failure mode classifier reads this flag.

To strengthen the benchmark, add **low-leakage products**:
- Startup / DTC brands launched within ~12 months (post-LLM cutoff)
- Niche regional brands without English-language coverage
- Newly internationalised products (domestic-only until very recently)

Candidate slots for low-leakage additions (open today, 2026-05-15):
- A K-beauty indie brand launched 2025 (e.g., Anua Heartleaf, Beauty of Joseon
  derivatives) — beauty / $15-25
- A K-food startup brand recently entering Costco/HMart (e.g., Boilingbobbles,
  Sunnybong) — food / $5-15
- A K-snack viral on TikTok in 2025 with no IR history — food / $3-8
- A Korean health supplement startup (e.g., Atomy, Kolmar) — health / $30-80

### 5b. Private holdout for genuinely sensitive cases

For products whose ground truth comes from NDA'd interviews or sensitive
commercial data, store the JSON under `validation/ground-truth-private/`
(gitignored — must be added to `.gitignore`). The loader can be pointed at
that directory via env var. Public benchmark stays clean; private holdout
stays in the operator's hands. **Skip this until needed** — the public
dataset is the primary tool.

### 6. Candidate countries must stay stable per product across builds

The same product re-scored across builds must use the same `candidateCountries`
list. Adding or removing countries changes the denominator of `top-N hit rate`
and silently improves/worsens the score. If you need to change candidates,
either bump `schemaVersion` or fork to a new product slug.

## Coverage targets

Phased rollout (see also `proposals/` if a more detailed roadmap exists):

| Phase | Total products | Categories required | Splits |
|---|---|---|---|
| **MVP** (now) | 4 | food (2), beauty (1), alcohol (1) | TUNING:3 / HOLDOUT:1 |
| **v1** | 10 | + health, beverage; max 50% in one category | TUNING:7 / HOLDOUT:3 |
| **v2** | 25-30 | all categories, ≥3 per category | TUNING:18 / HOLDOUT:8 |

Run `tsx scripts/validation-status.ts` (Phase 6) for a live coverage report.

## Adding a new product

1. Pick a slug (kebab-case product name, e.g., `binggrae-melona.json`)
2. Copy `ground-truth/buldak.json` as template
3. Fill at least 3 evidence rows (top-rank market, reject market, trend signal)
4. Set `split: "HOLDOUT"` unless the product is needed for tuning calibration anchors
5. Run `tsx scripts/validation-status.ts` to confirm schema validates
6. Commit ground truth **before** running any sim against it
