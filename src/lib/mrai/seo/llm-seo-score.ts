/**
 * LLM-SEO score (Phase 2.2b) — measures how likely answer-engines
 * (Claude/GPT/Gemini/Perplexity) are to extract and cite this draft
 * when answering user questions.
 *
 * Distinct from traditional Naver/Google SEO. Where SERP rank rewards
 * keyword density and meta tags, LLM citation rewards CLEAR FACTS,
 * COMPARISON STRUCTURE, Q&A FORMAT, AUTHORITATIVE TONE, and explicit
 * CONCLUSIONS. This is a HEURISTIC scorer — no LLM call, runs purely
 * on text patterns. Fast enough to compute on every draft save.
 *
 * Sub-scores (each 0..1):
 *   - factualDensity: numbers, dates, %, units, named entities present
 *   - comparisonStructure: "vs", "compared to", "while X, Y" patterns
 *   - qaFormat: question→answer patterns; headings ending in "?"
 *   - definitiveStatements: assertive sentences (no "maybe/probably/I think")
 *   - citationReadiness: external references, links, named sources
 *
 * Total = weighted avg × 100.
 */

import { getPlatformSpec } from "../platform-rules";

export type LLMSEOInput = {
  platform: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  body: string;
};

export type LLMSEOSubScore = {
  weight: number;
  score: number; // 0..1
  note: string;
};

export type LLMSEOResult = {
  total: number; // 0..100
  breakdown: {
    factualDensity: LLMSEOSubScore;
    comparisonStructure: LLMSEOSubScore;
    qaFormat: LLMSEOSubScore;
    definitiveStatements: LLMSEOSubScore;
    citationReadiness: LLMSEOSubScore;
  };
};

// LLM-citation friendliness matters most on long-form (blog / store /
// LinkedIn). Less on micro-format (X / Threads) where there's no room.
function weightsForPlatform(platform: string): {
  factualDensity: number;
  comparisonStructure: number;
  qaFormat: number;
  definitiveStatements: number;
  citationReadiness: number;
} {
  const spec = getPlatformSpec(platform);
  const longForm = spec.bodyMaxChars >= 800;
  if (longForm) {
    return {
      factualDensity: 0.25,
      comparisonStructure: 0.2,
      qaFormat: 0.2,
      definitiveStatements: 0.2,
      citationReadiness: 0.15,
    };
  }
  // Short-form: bias toward facts + definitive statements (the few
  // things LLMs can extract from a tweet/IG caption).
  return {
    factualDensity: 0.4,
    comparisonStructure: 0.1,
    qaFormat: 0.1,
    definitiveStatements: 0.3,
    citationReadiness: 0.1,
  };
}

const HEDGE_WORDS = [
  // English hedges
  "maybe",
  "probably",
  "possibly",
  "perhaps",
  "i think",
  "i guess",
  "kind of",
  "sort of",
  "seems",
  "could be",
  "might be",
  // Korean hedges
  "아마도",
  "어쩌면",
  "아마",
  "조금",
  "약간",
  "그런 것 같아",
  "인 듯",
  "같아요",
];

const COMPARISON_PATTERNS = [
  /\bvs\.?\b/i,
  /\bversus\b/i,
  /compared to/i,
  /비교하면|와\/과|보다/g,
  /while\s+\w+,\s*\w+/i,
  /unlike\b/i,
  /\bX와 Y/g,
  /더\s*\w+|덜\s*\w+/g, // "더 X" / "덜 X"
];

const QA_PATTERNS = [
  /^Q[:.]\s/m,
  /^A[:.]\s/m,
  /\?\s*\n/, // line ending with ?
  /^#{1,3}\s.+\?\s*$/m, // heading ending in ?
  /질문\s*:|답변\s*:/, // Korean Q/A markers
];

const DEFINITIVE_PATTERNS = [
  /\bis\s+(?:the|a|an)\s+/i,
  /\bare\s+(?:the|a|an)\s+/i,
  /\bcannot\b|\bnever\b|\balways\b|\bonly\b/i,
  /^.{5,80}[.!]$/m, // sentences ending with strong terminator
  /입니다\.|이다\.|다\.|이에요\.|예요\./, // Korean definitive endings
];

const CITATION_HINTS = [
  /https?:\/\/\S+/g,
  /\[\d+\]/g, // [1], [2] reference markers
  /according to|per\s+\w+|연구|보고서|논문|출처|기사/i,
  /\b\d{4}\b\s*년/g, // "2026년" — date citations
];

export function scoreLLMSEO(input: LLMSEOInput): LLMSEOResult {
  const w = weightsForPlatform(input.platform);
  const body = input.body ?? "";
  const lowerBody = body.toLowerCase();
  const totalChars = body.length || 1;

  // factualDensity: numbers, dates, %, units
  const numbers = (body.match(/\b\d+(?:[.,]\d+)?\s*(?:%|만|억|개|명|월|일|년|kg|m|cm|won|원|\$|usd)?/gi) ?? []).length;
  const ratio = numbers / Math.max(totalChars / 200, 1); // numbers per ~200 chars
  const factScore = Math.min(1, ratio / 3); // 3+ numbers per 200 chars = full marks
  const factualDensity: LLMSEOSubScore = {
    weight: w.factualDensity,
    score: factScore,
    note: `숫자/단위 ${numbers}회 (~${(ratio * 100).toFixed(0)}% per 200자)`,
  };

  // comparisonStructure
  let comparisonHits = 0;
  for (const re of COMPARISON_PATTERNS) {
    const matches = body.match(re);
    if (matches) comparisonHits += matches.length;
  }
  const comparisonScore = Math.min(1, comparisonHits / 2);
  const comparisonStructure: LLMSEOSubScore = {
    weight: w.comparisonStructure,
    score: comparisonScore,
    note:
      comparisonHits >= 2
        ? `비교 구조 ${comparisonHits}개 (vs / 비교 / 보다)`
        : comparisonHits === 1
          ? "비교 표현 1회 (더 강화 권장)"
          : "비교 구조 없음 — LLM이 인용 시 결정적 답으로 인용하기 어려움",
  };

  // qaFormat
  let qaHits = 0;
  for (const re of QA_PATTERNS) {
    const matches = body.match(re);
    if (matches) qaHits += matches.length;
  }
  const qaScore = Math.min(1, qaHits / 2);
  const qaFormat: LLMSEOSubScore = {
    weight: w.qaFormat,
    score: qaScore,
    note:
      qaHits >= 2
        ? `Q&A 패턴 ${qaHits}개`
        : qaHits === 1
          ? "Q&A 1회"
          : "Q&A 포맷 없음 — 헤딩을 질문형으로 (예: '어떻게 ~?')",
  };

  // definitiveStatements: count definitive endings minus hedge words
  let definitiveHits = 0;
  for (const re of DEFINITIVE_PATTERNS) {
    const m = body.match(re);
    if (m) definitiveHits += m.length;
  }
  let hedgeHits = 0;
  for (const h of HEDGE_WORDS) {
    if (lowerBody.includes(h)) hedgeHits++;
  }
  const definitiveRaw = Math.max(0, definitiveHits - hedgeHits * 2);
  const sentences = body.split(/[.!?]/).filter((s) => s.trim().length > 5).length || 1;
  const defScore = Math.min(1, definitiveRaw / Math.max(sentences * 0.5, 1));
  const definitiveStatements: LLMSEOSubScore = {
    weight: w.definitiveStatements,
    score: defScore,
    note: `단정 ${definitiveHits} − 헤지 ${hedgeHits}×2 = ${definitiveRaw} (LLM은 단정적 글을 인용)`,
  };

  // citationReadiness
  let citationHits = 0;
  for (const re of CITATION_HINTS) {
    const m = body.match(re);
    if (m) citationHits += m.length;
  }
  const citationScore = Math.min(1, citationHits / 2);
  const citationReadiness: LLMSEOSubScore = {
    weight: w.citationReadiness,
    score: citationScore,
    note:
      citationHits >= 2
        ? `인용 가능 신호 ${citationHits}개 (URL / 출처 / 연도)`
        : citationHits === 1
          ? "인용 신호 1개 (출처·연도 더 추가 권장)"
          : "인용 가능 신호 없음 — 외부 출처/연도/통계 인용 추가 권장",
  };

  const breakdown = {
    factualDensity,
    comparisonStructure,
    qaFormat,
    definitiveStatements,
    citationReadiness,
  };
  const total = Math.round(
    Object.values(breakdown).reduce((acc, s) => acc + s.weight * s.score, 0) * 100,
  );
  return { total, breakdown };
}
