# Calibration framework

Every numeric constant that influences simulation output lives here, tagged
with its provenance. The point: make the question "where did this number
come from?" answerable from one folder.

## The three sources

Each calibration constant declares one of three sources via the
`CalibrationSource` type in [provenance.ts](provenance.ts).

| Source | Update cadence | Owner |
|---|---|---|
| `DATA_DERIVED` | When the upstream dataset refreshes | The data |
| `DOMAIN_RULE` | When the business judgement changes | The user |
| `TUNING_ANCHOR` | When the next holdout validation lands | This folder |

The first two are stable. The third is dangerous.

## The TUNING_ANCHOR rule

A `TUNING_ANCHOR` is any number chosen by looking at simulation output —
"the 5th run showed X, so we set the weight to Y." These are the numbers
most likely to overfit the products we happen to have validated against.

Every `TUNING_ANCHOR` MUST declare:

1. **`informedByRuns`** — which validation runs this value was tuned against
2. **`holdoutProducts`** — products we DIDN'T tune against, where the value
   should still hold (empty array means "no holdout, value is suspect")
3. **`reviewBy`** — date forcing re-evaluation, default 90 days

Adding a new `TUNING_ANCHOR` should feel uncomfortable. If a new fix takes
the form "observe sim → pick number → ship," ask first whether a
`DATA_DERIVED` replacement exists (a real prevalence survey, an industry
benchmark, a published cohort study). The pattern of stacking anchors is
the failure mode this folder exists to surface.

## Held-out validation methodology

Magic numbers fitted to the same products we measure accuracy on don't
prove anything. The validation set must be split.

### Current product roster (2026-05-15)

| Product | Category | Role | Last run |
|---|---|---|---|
| Buldak ramen | food | TUNING | 5th run, 2026-05-15 (ensemble 10dbb41a) |
| Shin Ramyun | food | TUNING | 2nd run, 2026-05-14 |
| COSRX Snail Mucin | beauty | TUNING | 3rd run, 2026-05-14 |
| Jinro Soju | alcohol | HOLDOUT | 4th run, 2026-05-14 (worker pre-deploy) |

Three tuning products, one holdout. Rule: any new TUNING_ANCHOR shipped
must show its predicted effect when re-tested on the holdout — not just
on the products that informed it.

### When the roster changes

- **New product validated** → first run lands as HOLDOUT. After two clean
  holdout passes, may move to TUNING.
- **TUNING product re-validated** → check whether the latest tuning still
  fits it. Drift is a signal the anchor is overfitting.
- **HOLDOUT failed** → the most recent TUNING_ANCHOR is suspect. Don't
  ship a follow-up anchor that fits the holdout — that just moves the
  overfit, doesn't remove it. Investigate why the anchor doesn't
  generalize before adding code.

### What "the holdout passes" means

For each shipped TUNING_ANCHOR, the rationale field declares the expected
effect on the holdout product (e.g., "Jinro EU finalScore should rise
from 48 → 55+ once marketSize 30% weight applies"). The holdout passes
when:

1. The expected effect direction is observed (the magnitude can miss)
2. No previously-correct holdout signal regresses

A holdout pass doesn't validate the anchor — it just fails to disprove it.
Two consecutive passes on different products is the bar for treating an
anchor as "stable enough to consider DATA_DERIVED replacement deferred."

## Files

| File | What it tags |
|---|---|
| [provenance.ts](provenance.ts) | `calibrated()` wrapper + `CalibrationSource` type |
| [score-weights.ts](score-weights.ts) | finalScore component weights + regulatory hard floor |
| [ltv-multipliers.ts](ltv-multipliers.ts) | Per-category LTV multipliers + KO/EN rationale strings |
| [profession-caps.ts](profession-caps.ts) | Diet-restricted persona caps in food category |
| [competition-rubric.ts](competition-rubric.ts) | Competition score band thresholds |
| [income-bracket-slack.ts](income-bracket-slack.ts) | Bracket boundary slack for pool persona validation |

Income distribution per country still lives in
[../income-distribution.ts](../income-distribution.ts) since it's
genuinely DATA_DERIVED (World Bank / OECD) and pulls in heavy logic
(sampler + parser + validator). Treat it as part of this folder
conceptually.
