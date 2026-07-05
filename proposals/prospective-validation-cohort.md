# Prospective Validation Cohort — pre-registered (2026-07-06)

**Purpose.** The N=20 hindsight backtest (top-1 45% / top-3 75%) could only test
the *macro* engine — the live-only signals shipped since (per-country search
volume + trajectory, TikTok, Baidu, brand-GTM discovery, dominance-calibrated
confidence) cannot be backtested because they reflect the present. This cohort
tests them **forward**: freeze a prediction for real brands that are AT the
overseas-expansion decision point *now*, then re-check the actual market later.

**This document is pre-registered** — the predictions and check dates are frozen
here (git-committed) and in the `ensembles` table before any outcome is known, so
the goalposts can't move. It is the honest, transparent record.

## Method

- **Cohort:** 15 real consumer brands, 9 origin countries, 5 categories, each
  genuinely mid-expansion (target market not yet decided/won as of 2026-07).
- **Prediction:** live sim (hypothesis tier) run 2026-07-06; the ensemble's
  top-1 recommendation, top-3 shortlist, and confidence are frozen (below +
  in the `ensembles` table, workspace `0c8e774f…`).
- **Ground truth:** the **first SUSTAINED / largest overseas market** (revenue +
  longevity), same definition as the backtest — "first entered" ≠ "first won".
- **Check dates:**
  - **Entry check — 2026-10 to 2027-01 (3-6 mo):** which market did they
    actually enter / prioritize (launches, distribution deals, localized sites).
  - **Sustained check — 2027-07 (12 mo):** which market is the largest durable
    one. This is the real scoring date; 3-6 mo is an early read only.
- **Scoring:** top-1 hit, top-3 hit, and confidence calibration (does STRONG
  actually run high?) — via `outcome_feedback` + `scripts/outcome-calibration.ts`.

**Honest caveats.** (1) Circularity: a brand already visibly winning a market
would make the live signal self-fulfilling — the cohort deliberately picks
brands where the outcome is still open, but partial contamination is possible
and disclosed. (2) 3-6 mo is early — expansion outcomes mature over 12-18 mo, so
the 12-mo check is the real one. (3) N=15 is a case-study cohort; CIs are wide.
(4) Some categories/statuses (e.g. Little Ears) still need confirmation.

## Cohort & frozen predictions

Predictions are filled from each brand's live ensemble (sim date 2026-07-06).

| Brand | Origin | Category | Candidate markets | **Pred top-1** | Pred top-3 | Conf | Actual (entry) | Actual (sustained) | Hit |
|---|---|---|---|---|---|---|---|---|---|
| FRONT2LINE | KR | Fashion | JP·TW·US·DE·FR·SG·TH | _TBD_ | | | | | |
| Le Mouton | KR | Fashion (shoes) | JP·TW·DE·FR·US·SG | _TBD_ | | | | | |
| Torriden | KR | Beauty | US·JP·CN·TW·SG·TH·VN·ID | _TBD_ | | | | | |
| Srichand | TH | Beauty | ID·MY·SG·PH·VN·CN·JP·AE | _TBD_ | | | | | |
| Y.O.U Beauty | ID | Beauty | MY·PH·SG·TH·VN·SA·AE·IN | _TBD_ | | | | | |
| Kopi Kenangan | ID | Beverage | MY·SG·PH·TH·TW·AE·SA·IN | _TBD_ | | | | | |
| Buttonscarves | ID | Fashion | MY·SG·SA·AE·GB·US·BR | _TBD_ | | | | | |
| Cocoon | VN | Beauty | JP·KR·US·FR·DE·SG·TH·GB | _TBD_ | | | | | |
| Cong Caphe | VN | Beverage | KR·JP·US·SG·MY·AU·CA·TW | _TBD_ | | | | | |
| Little Ears | TW | Consumer | SG·MY·JP·US·CN·TH·VN·AU | _TBD_ | | | | | |
| Mosaic Wellness | IN | Health | US·GB·AE·SA·SG·AU·CA·MY | _TBD_ | | | | | |
| Atomgrid | IN | Beauty | US·GB·AE·SG·MY·AU·SA·DE | _TBD_ | | | | | |
| YSE Beauty | US | Beauty | GB·CA·AU·JP·KR·SG·DE·FR | _TBD_ | | | | | |
| SISI | JP | Beauty | US·CN·TW·KR·SG·TH·VN·GB | _TBD_ | | | | | |
| Ieva Group | FR | Beauty | US·GB·DE·IT·ES·JP·CN·AE | _TBD_ | | | | | |

Seed: `scripts/prospective-cohort-seed.ts`. Run: `scripts/smoke-ensemble-e2e.ts -- <prefix> hypothesis`.
