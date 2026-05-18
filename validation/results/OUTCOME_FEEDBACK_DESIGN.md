# Outcome feedback loop — design

Drafted 2026-05-18. Post-Phase-F.1 path to break the accuracy ceiling that
external anchors alone can't reach. Mandatory pre-read once mean composite
crosses 80 — at that point, outcome-feedback becomes the highest-leverage
remaining lever.

## Why this exists

Phase F.0-F.1-F.3 anchors all share one limit: they reflect *what is known
about a market today*. They don't tell us whether a sim's recommendation
*was actually correct after the brand launched*. Without that signal, the
ceiling is set by anchor quality, not by what the brand learned post-launch.

The cure is a closed loop:
```
sim recommends → user launches → real outcome captured → GT updated → next sim improves
```

Without this loop the accuracy gate stays around 80 (anchor ceiling). With
it, 85-90 is reachable as outcome corpus grows.

## What "outcome" means concretely

For each completed sim, we want to capture (within 30-90 days of launch):

| Outcome dimension | Source | Granularity |
|---|---|---|
| Did the user enter the recommended top-3 markets? | Self-report form / Slack push | Per-market boolean |
| Revenue in each market (first 90 days) | User self-report, optionally Stripe API | USD/month |
| Channel that worked (Amazon/TikTok/Sephora/etc.) | User self-report | Free-text or chip select |
| Markets they REJECTED our recommendation on, and why | User self-report | Markets + reason text |
| Time-to-revenue (days from launch to first $1k) | Self-report | Days |

Each outcome row references the source `ensemble_id` so we can join back to
exactly what the sim predicted vs what happened.

## Data model sketch

New table `sim_outcomes`:
```sql
create table sim_outcomes (
  id uuid primary key default gen_random_uuid(),
  ensemble_id uuid not null references ensembles(id),
  workspace_id uuid not null references workspaces(id),
  reported_by uuid references auth.users(id),
  reported_at timestamptz not null default now(),
  launch_date date not null,
  outcomes jsonb not null,        -- {entered_markets, revenue_by_market, channels, rejected_markets, time_to_revenue_days}
  notes text,
  -- optional Stripe/data-source integration
  stripe_period_start date,
  stripe_period_end date
);
create index on sim_outcomes (ensemble_id);
create index on sim_outcomes (workspace_id, launch_date desc);
```

## Capture surfaces (collection UX)

Three ways to elicit outcomes, in order of friction:

### 1. Email nudge at +30 / +60 / +90 days post-sim-completion
- Subject: "당신의 [제품명] 진출 결과 — 30초 입력"
- Single CTA opens `/outcomes/new?ensemble=<id>` form
- 5 questions, conditional show, completes in 30-90 seconds
- Hooks into existing Sentry/email; no new infra

### 2. In-app banner when user opens any past ensemble report
- "이 분석 이후 진출 결과를 기록하셨나요?"
- One-click to outcome form prefilled with ensemble id
- Persistent until dismissed or submitted

### 3. Slack bot (enterprise tier only)
- Posts to user's chosen channel at +90 days
- Threaded replies for each market — minimal cognitive load

## GT auto-update pipeline

```
1. New sim_outcomes row → trigger function
2. Aggregate outcomes per product slug across all workspaces (privacy-respecting)
3. Compare aggregated outcome top-3 markets vs current GT top-3 markets
4. If mismatch + ≥3 independent confirmations: 
     - Create proposed_truth_update row (review queue)
     - Slack alert to truth maintainer
5. Maintainer reviews → approve → updates validation/ground-truth/<slug>.json
6. Auto-PR opened by GitHub Action; CI runs benchmark before merge
```

Privacy + data layer:
- Per-workspace data NEVER leaves workspace boundary
- GT updates use aggregate counts only (no per-customer revenue figures)
- Each proposed_truth_update lists "N workspaces confirm" not workspace names
- Opt-out: workspace can disable outcome contribution while still receiving sims

## Bootstrap path (cold-start)

First 6-12 months will have minimal outcomes data. Bootstrap path:

1. **Founder-led pilot interviews**: 10 paid pilots × 90-day outcome interview
   → Hand-curated outcome rows. Use to validate the form questions and the
   GT-update pipeline mechanics on a small dataset before automation.

2. **Public-figure case studies**: Use published K-export success/failure
   case studies (KOTRA 기업성공사례 API already integrated) as quasi-outcomes
   to seed the corpus.

3. **Retro outcomes from existing fixtures**: Where IR filings confirm
   "Binggrae VN top market" etc, treat as historical outcome rows that
   feed the same pipeline (audit trail makes them distinguishable from
   live customer outcomes).

## Accuracy projection with outcome corpus

Rough model based on similar feedback-loop systems:

| Outcome corpus size | Expected accuracy lift |
|---|---|
| 0 (anchor only) | 80 ceiling |
| 50 rows | 82-83 (noise floor) |
| 200 rows | 84-86 (per-category corrections kick in) |
| 500 rows | 87-89 (per-channel learnings emerge) |
| 1,000+ rows | 90+ (true ceiling depends on world's actual unpredictability) |

50 rows is roughly 6-12 months of paid pilot scale. 200 rows likely
mid-2027. 500 rows is 2028 territory. The cycle is slow — but it's the
only mechanism that breaks the 80 anchor ceiling.

## Pre-ship checklist (mandatory before launching this loop)

| Check | Why | Status |
|---|---|---|
| Privacy review | Per-workspace data isolation | TODO |
| Opt-in default true vs false | Default false is the honest choice | TODO |
| Maintainer review queue UX | Bad outcomes auto-update GT = disaster | TODO |
| Quasi-outcomes have distinct schema marker | Don't conflate IR-derived with customer-reported | TODO |
| Outcome form fits ≤90 seconds | Friction kills response rate | TODO |
| Email nudge cadence A/B | +30/+60/+90 vs others | TODO |
| Slack bot is enterprise-only | Avoids small-customer noise | TODO |
| Auto-PR gate: CI benchmark must pass | Prevent regression from outcome update | TODO |

## When to ship this

**Not before** all of:
- Mean composite ≥ 78 stable (Phase F.1 close)
- 5+ paid pilot customers (have someone to ask)
- Closed-beta launched (signup gating off)

**Roughly mid-Q3 2026** if Phase F.1 closes this week and beta cohort fills
by end of June.

## Cross-references

- [[v7-full-region-breakthrough]] — mean 72.0 baseline this loop will extend
- [[anchor-design-lessons]] — current anchor failure modes the loop can't fix
- [[phase_f_api_catalog]] — anchor catalog Phase F shipped against
- [[v0_1_priority]] — accuracy > polish > revenue ladder this respects
- Repo: validation/results/PHASE_F_TRAJECTORY.md
