# AI Market Twin · One-Pager (Government & Investor)

**Predict the overseas success probability of a K-product before launch**

| | |
|---|---|
| Entity | Mr.AI Inc. (Market Twin) |
| Korean business no. | 693-87-03907 (incorporated May 2026) |
| Founder | Chris Lee · contact@markettwin.ai |
| Domain | https://www.markettwin.ai |
| Stage | Pre-launch (closed beta) · Business plan v4.5 (2026-05-17) |

---

## Problem

> **Korean exporters: 1-year survival rate 49.2%, 5-year survival rate 16.3%.**

The root cause is the absence of local-consumer pre-validation. Traditional market research costs ~₩1.3B (~$1M USD) and takes 6 months — effectively inaccessible to SMB exporters.

## Solution

**Simulate AI consumer personas grounded in 24-country government open data** — complete market validation in 7-22 minutes for ₩0.4M-4M (~$300-3K). **1,000× faster, 300× cheaper** than traditional research.

- **24-country government statistics** live-grounded (KOSIS, BLS, e-Stat, Vietnam GSO, Indonesia BPS, 27 seeds total)
- **Multi-LLM ensemble** (Claude + OpenAI + DeepSeek round-robin) + 3-layer voice sanitizer
- **6-source external anchor stack** — Hofstede culture / World Bank macro / UN Comtrade / Korea Customs / DART financials & region-revenue / KOTRA Korean-companies abroad

## Measured & Disclosed Accuracy (Phase F.1 result)

> **First statistically significant win achieved (paired t-test p=0.0086 ✓)**

```
6-product paired benchmark, 2026-05-17
  Mean composite     72.0 / 100   (95% CI [61.7, 83.3])
  HOLDOUT n=2        75.4         (TUNING n=4: 70.4 — no overfit)
  vs v6 paired Δ     +17.4 pt     (p = 0.0086, significant at 95%)
  vs v0 baseline     +31.6 pt     (40.4 → 72.0, single-day arc)
```

Approaching the ≥80 production gate. **2 of 6 fixtures (LG OLED 84.1, KGC 96.4) already pass.**

5-metric self-scoring (top3Hit / rankCorrelation / rejectRecall / confidenceCalibration / trendMatch) + paired t-test + FDR + bootstrap CI — every result open-sourced on GitHub (https://github.com/hwlee1978/market-twin/tree/main/validation/results).

## Differentiation

| Dimension | Generic AI chatbot / Traditional research | AI Market Twin |
|---|---|---|
| Data grounding | General web training | 24-country official statistics + 6 anchors |
| Source traceability | None | Every persona statement → cited statistic cell |
| Accuracy disclosure | None | paired t-test, FDR, 5-metric weekly measurement & public log |
| Cost · time | ₩1.3B · 6 months | ₩4M · 22 minutes |

## Market + Business Model

- **AI market research TAM**: $7.97B (2025) → $16.80B (2030), CAGR 16.1%
- **K-Beauty + K-Food overseas**: ~₩31T / **K-Content**: ₩16T+
- **Revenue**: SaaS subscription ₩290k-1.49M (4-tier) + enterprise consulting + API licensing
- **Customers**: SMB exporters + government/public agencies (KOTRA-style) + global K-product brands

## Government Suitability (2026 AI+ OpenData Challenge Applicant)

| Item | Detail |
|---|---|
| Project no. | 20457281 (Market Entry Strategy Recommendation) |
| Value | Integrate KORIA + KOSME data → K-export policy infrastructure |
| Verification governance | Self-built accuracy measurement infra (only applicant with auditable accuracy) |
| Demonstrability | v7 mean 72.0, paired p=0.0086 — not "claimed" but **measured** accuracy |

## Team & Infrastructure

- Chris Lee (CEO/CTO) — sole full-stack + AI simulation system architect
- Stack: Next.js + Supabase + multi-LLM (Claude/OpenAI/DeepSeek) + Vercel + Cloud Run worker
- Certifications roadmap: ISMS-P 2027 Q2, ISO 27001 2027 Q3
- AI responsibility: NIST AI RMF · EU AI Act · OECD AI Principles · Korean AI Ethics Guidelines compliant

## Ask

- **Government / public agencies**: 2026 AI+ OpenData Challenge selection → 6-month KORIA/KOSME integration + 10-company beta demonstration
- **Investors**: Seed round (12-month runway to 80-point accuracy gate + 10 paid pilots)
- **K-product brands**: Pre-launch validation beta participation (KOTRA-style gov-buyer referrals welcome)

## Learn More

| Resource | URL / path |
|---|---|
| Marketing site | https://www.markettwin.ai/en |
| Methodology + accuracy disclosure | https://www.markettwin.ai/methodology-en.html |
| Trust + AI responsibility | https://www.markettwin.ai/trust-en.html |
| Business plan v4.5 (full) | proposals/MarketTwin_BusinessPlan_v4_5.docx |
| Phase F accuracy trajectory | validation/results/PHASE_F_TRAJECTORY.md |
| Anchor design lessons | validation/results/ANCHOR_DESIGN_LESSONS.md |

---

**"Recommend a K-product's next market — with data, not guesses."**
contact@markettwin.ai · https://www.markettwin.ai
