/**
 * Cross-validation report content generator.
 *
 * Takes an ensemble result + project context and produces a structured,
 * consulting-grade cross-check narrative. The PDF renderer (validation-pdf.tsx)
 * lays this data out in a McKinsey/BCG-inspired layout.
 *
 * Two-stage approach:
 *   1. Deterministic data prep — pull the sim winner, runner-up, score table,
 *      consensus type, candidate countries from the ensemble aggregate.
 *   2. LLM augmentation — Anthropic Sonnet writes the cross-check narrative
 *      sections (market validation, competitor analysis, risks, etc.) given
 *      the deterministic data + project context.
 *
 * Output is a strongly-typed structure rendered server-side by react-pdf.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { EnsembleAggregate } from "@/lib/simulation/ensemble";

export interface ProjectContext {
  productName: string;
  category: string | null;
  description: string | null;
  basePriceCents: number | null;
  currency: string | null;
  originatingCountry: string | null;
  candidateCountries: string[];
  competitorNames?: string[] | null;
}

export interface ValidationReportData {
  meta: {
    productName: string;
    ensembleId: string;
    generatedAt: string;
    tier: string;
    simCount: number;
    personaCount: number;
    llmProviders: string[];
    locale: "ko" | "en";
  };
  simResult: {
    winner: string;
    consensusPercent: number;
    confidence: "STRONG" | "MODERATE" | "WEAK";
    consensusType?: string;
    voteDistribution: Array<{ country: string; count: number; percent: number }>;
    scoreRanking: Array<{ country: string; mean: number; std: number }>;
    topCountriesTied: boolean; // whether top-2 scores are within 1pt of each other
    runnerUp?: string;
  };
  executiveSummary: {
    headline: string; // 1-line bold conclusion
    confidenceGrade: "A" | "B+" | "B" | "C+" | "C";
    confidenceLabel: string;
    keyMessage: string; // 2-3 sentence executive narrative
    threeActions: string[]; // top 3 actions for management
  };
  marketValidation: {
    marketGrowthSignal: string; // e.g. "CAGR 10.49% (2024-2029)"
    growthSource: string;
    segmentFit: string; // e.g. "Women's athleisure rapid expansion matches target"
    timingAssessment: string; // "right time", "wait", etc.
    citations: Array<{ label: string; url?: string }>;
  };
  competitiveLandscape: {
    peerBrandPattern: string; // e.g. "MULA chose TW as first overseas market"
    peerBrandExamples: Array<{ brand: string; signal: string }>;
    competitiveIntensity: "low" | "moderate" | "high";
    differentiationOpportunity: string;
  };
  alignmentMatrix: Array<{
    dimension: string;
    simSignal: string;
    externalData: string;
    alignment: "high" | "medium" | "low" | "concern";
    note: string;
  }>;
  riskAssessment: Array<{
    risk: string;
    severity: "high" | "medium" | "low";
    mitigation: string;
  }>;
  phasedExecution: {
    phase1: { duration: string; goal: string; deliverables: string[] };
    phase2: { duration: string; goal: string; deliverables: string[] };
    phase3: { duration: string; goal: string; deliverables: string[] };
  };
  limitations: string[];
  appendix: {
    dataSources: Array<{ category: string; source: string; reliability: "A" | "B+" | "B" | "C" }>;
    methodology: string;
    contact: string;
  };
}

function buildPrompt(
  agg: EnsembleAggregate,
  project: ProjectContext,
  simData: ValidationReportData["simResult"],
  locale: "ko" | "en",
): string {
  const isKo = locale === "ko";
  const price = project.basePriceCents != null
    ? `${(project.basePriceCents / 100).toFixed(2)} ${project.currency ?? "USD"}`
    : "unknown";
  const winner = simData.winner;
  const runnerUp = simData.runnerUp ?? "";
  const lang = isKo ? "한국어" : "English";

  return `You are a senior strategy consultant at a top-tier firm (McKinsey/BCG/Bain), writing a market-entry cross-validation report.

Product context:
- Product: ${project.productName}
- Category: ${project.category ?? "—"}
- Origin: ${project.originatingCountry ?? "—"}
- Price: ${price}
- Description: ${project.description ?? "—"}
- Candidates: ${project.candidateCountries.join(", ")}
- Competitors: ${(project.competitorNames ?? []).join(", ") || "—"}

Simulation result (the AI Market Twin system ran ${agg.simCount ?? "?"} parallel simulations):
- Recommended winner: ${winner} (${simData.consensusPercent}% multi-LLM consensus, ${simData.confidence})
- Vote breakdown: ${simData.voteDistribution.map(v => `${v.country} ${v.percent}%`).join(", ")}
- Top score ranking: ${simData.scoreRanking.slice(0, 3).map(s => `${s.country} ${s.mean.toFixed(1)}`).join(" / ")}
- Tied at top: ${simData.topCountriesTied ? "yes (with " + runnerUp + ")" : "no"}
- Sim executive summary (recommended action from sim): ${agg.narrative?.executiveSummary?.slice(0, 400) ?? "—"}

Your job: produce a strict JSON cross-validation report in ${lang}. Be specific, cite real industry/market signals you know about (do NOT fabricate numbers — if you don't know, say "estimate" or "industry standard"). Tone: McKinsey-direct, decisive, no fluff.

Return ONLY this JSON object (no other text):

{
  "executiveSummary": {
    "headline": "One-line bold conclusion in ${lang}, max 70 chars. Start with emoji (🎯 ✓ ⚠ ❌ 🔥) for tone.",
    "confidenceGrade": "A | B+ | B | C+ | C — pick one based on signal strength",
    "confidenceLabel": "Short label in ${lang} explaining the grade (max 30 chars)",
    "keyMessage": "2-3 sentence executive narrative in ${lang}. State the recommendation, single biggest reason, and single biggest risk. Direct, no hedging.",
    "threeActions": ["Action 1 in ${lang}", "Action 2", "Action 3"] — three concrete actions management should take in next 90 days, each <70 chars
  },
  "marketValidation": {
    "marketGrowthSignal": "e.g. 'CAGR 10.5% (2024-2029)' — your best estimate of the recommended market's growth rate for this category, in ${lang}",
    "growthSource": "What you base this on, in ${lang} (e.g. 'Bonafide Research / industry analysts')",
    "segmentFit": "1 sentence in ${lang}: how the recommended market's consumer segment fits the product",
    "timingAssessment": "One of: '진출 적시' / '6개월 더 관망' / '관망 권장' (translate to EN if locale=en). Explain in one phrase.",
    "citations": [
      {"label": "${isKo ? '시장 보고서' : 'Market report'}", "url": "https://..."},
      {"label": "${isKo ? '업계 매체' : 'Industry press'}", "url": "https://..."}
    ]
  },
  "competitiveLandscape": {
    "peerBrandPattern": "1 sentence: do peer brands enter this market first/late? in ${lang}",
    "peerBrandExamples": [
      {"brand": "Brand A", "signal": "What they did in this market, in ${lang}"},
      {"brand": "Brand B", "signal": "..."},
      {"brand": "Brand C", "signal": "..."}
    ] — list 2-4 real peer brands you know about,
    "competitiveIntensity": "low | moderate | high",
    "differentiationOpportunity": "1 sentence in ${lang}: how the product can stand out"
  },
  "alignmentMatrix": [
    {
      "dimension": "${isKo ? '시장 성장' : 'Market growth'}",
      "simSignal": "${isKo ? '시뮬이 본 신호' : 'What the sim says'}",
      "externalData": "${isKo ? '외부 데이터' : 'External data'}",
      "alignment": "high | medium | low | concern",
      "note": "Short note in ${lang}"
    }
    // 5-6 dimensions total: 시장 성장, 타깃 segment, 경쟁 brand, 시장 사이즈, 진입 채널, 가격 적합성
  ],
  "riskAssessment": [
    {
      "risk": "Risk description in ${lang}",
      "severity": "high | medium | low",
      "mitigation": "How to mitigate, in ${lang}"
    }
    // 4-6 risks total
  ],
  "phasedExecution": {
    "phase1": {
      "duration": "${isKo ? 'Day 1-90' : 'Day 1-90'}",
      "goal": "Phase 1 goal in ${lang}",
      "deliverables": ["Deliverable 1", "Deliverable 2", "Deliverable 3", "Deliverable 4"]
    },
    "phase2": { "duration": "...", "goal": "...", "deliverables": [...] },
    "phase3": { "duration": "...", "goal": "...", "deliverables": [...] }
  },
  "limitations": [
    "Limitation 1 in ${lang}",
    "Limitation 2",
    "Limitation 3",
    "Limitation 4"
  ],
  "appendix": {
    "dataSources": [
      {"category": "${isKo ? '시뮬레이션' : 'Simulation'}", "source": "AI Market Twin (multi-LLM ensemble)", "reliability": "A"},
      {"category": "${isKo ? '시장 데이터' : 'Market data'}", "source": "...", "reliability": "B+ | B"}
      // 5-7 sources total
    ],
    "methodology": "1-2 sentence description of the methodology in ${lang}",
    "contact": "contact@markettwin.ai"
  }
}

Critical rules:
- Output ONLY the JSON object, no prose, no markdown fences
- All text fields in ${lang} except brand names (use original)
- Be specific: real numbers, real brand names, real reasoning
- Don't fabricate citation URLs you're not sure exist — use "industry source" or omit url
- Tone: confident, decisive, McKinsey-style. No "might", "could", "perhaps"
- 'threeActions' must be concrete: numbers, dates, specific channels`;
}

function safeJsonParse(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

function deriveSimData(agg: EnsembleAggregate): ValidationReportData["simResult"] {
  const rec = agg.recommendation;
  const winner = rec?.country?.toUpperCase() ?? "?";
  const dist = (agg.bestCountryDistribution ?? []).map((b) => ({
    country: b.country,
    count: b.count,
    percent: b.percent,
  }));
  const ranking = (agg.countryStats ?? [])
    .map((c) => ({
      country: c.country,
      mean: c.finalScore?.mean ?? 0,
      std: c.finalScore?.std ?? 0,
    }))
    .sort((a, b) => b.mean - a.mean);
  const topTied = ranking.length >= 2 && Math.abs(ranking[0].mean - ranking[1].mean) < 1;
  const runnerUp = ranking.length >= 2 ? ranking[1].country : undefined;
  return {
    winner,
    consensusPercent: rec?.consensusPercent ?? 0,
    confidence: (rec?.confidence ?? "MODERATE") as "STRONG" | "MODERATE" | "WEAK",
    consensusType: rec?.consensusType,
    voteDistribution: dist.slice(0, 6),
    scoreRanking: ranking,
    topCountriesTied: topTied,
    runnerUp: topTied ? runnerUp : undefined,
  };
}

export async function generateValidationContent(
  agg: EnsembleAggregate,
  project: ProjectContext,
  opts: {
    ensembleId: string;
    tier: string;
    locale: "ko" | "en";
    llmProviders: string[];
    anthropicKey?: string;
  },
): Promise<ValidationReportData | null> {
  const apiKey = opts.anthropicKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[validation-content] ANTHROPIC_API_KEY missing");
    return null;
  }

  const simData = deriveSimData(agg);
  const prompt = buildPrompt(agg, project, simData, opts.locale);

  const client = new Anthropic({ apiKey });
  let llmText = "";
  try {
    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 6000,
      messages: [{ role: "user", content: prompt }],
    });
    const block = resp.content.find((b) => b.type === "text");
    llmText = block && block.type === "text" ? block.text : "";
  } catch (err) {
    console.warn(`[validation-content] LLM error: ${(err as Error).message}`);
    return null;
  }

  const parsed = safeJsonParse(llmText);
  if (!parsed) {
    console.warn(`[validation-content] JSON parse failed. First 200c: ${llmText.slice(0, 200)}`);
    return null;
  }

  const personaCount = agg.effectivePersonas ?? 200;
  return {
    meta: {
      productName: project.productName,
      ensembleId: opts.ensembleId,
      generatedAt: new Date().toISOString(),
      tier: opts.tier,
      simCount: agg.simCount ?? 0,
      personaCount,
      llmProviders: opts.llmProviders,
      locale: opts.locale,
    },
    simResult: simData,
    executiveSummary: (parsed.executiveSummary as ValidationReportData["executiveSummary"]) ?? {
      headline: "",
      confidenceGrade: "B",
      confidenceLabel: "",
      keyMessage: "",
      threeActions: [],
    },
    marketValidation: (parsed.marketValidation as ValidationReportData["marketValidation"]) ?? {
      marketGrowthSignal: "",
      growthSource: "",
      segmentFit: "",
      timingAssessment: "",
      citations: [],
    },
    competitiveLandscape: (parsed.competitiveLandscape as ValidationReportData["competitiveLandscape"]) ?? {
      peerBrandPattern: "",
      peerBrandExamples: [],
      competitiveIntensity: "moderate",
      differentiationOpportunity: "",
    },
    alignmentMatrix: (parsed.alignmentMatrix as ValidationReportData["alignmentMatrix"]) ?? [],
    riskAssessment: (parsed.riskAssessment as ValidationReportData["riskAssessment"]) ?? [],
    phasedExecution: (parsed.phasedExecution as ValidationReportData["phasedExecution"]) ?? {
      phase1: { duration: "Day 1-90", goal: "", deliverables: [] },
      phase2: { duration: "Day 91-270", goal: "", deliverables: [] },
      phase3: { duration: "Day 271+", goal: "", deliverables: [] },
    },
    limitations: (parsed.limitations as string[]) ?? [],
    appendix: (parsed.appendix as ValidationReportData["appendix"]) ?? {
      dataSources: [],
      methodology: "",
      contact: "contact@markettwin.ai",
    },
  };
}
