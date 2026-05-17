/**
 * Description echo-bias detector.
 *
 * The simulator runs LLM personas against a project description. When the
 * description itself contains *external market facts* — "1위 in CN", "Amazon
 * US bestseller", "베트남 시장 30% 점유" — the LLM has been observed to echo
 * those facts straight back as recommendations instead of reasoning about
 * them. This is defect #6 in [[simulation_accuracy_validation]] and
 * resurfaced in benchmark v1 as defect #11 (well-known products with
 * leaked facts in the description score artificially high).
 *
 * Active defense: scan the description text for sentence-level patterns
 * that look like market facts and surface a warning in the wizard. We
 * don't auto-strip — the user might have legitimate brand context the
 * sim should know. We only flag.
 *
 * Heuristic over LLM: this runs on every keystroke, must be cheap and
 * deterministic. False positives are OK (user can ignore); false
 * negatives are the failure mode we care about.
 */

export type EchoCategory =
  | "rank"          // "1위", "rank 1", "top market"
  | "share"         // "점유율", "market share", "%"
  | "bestseller"    // "베스트셀러", "bestseller", "viral"
  | "revenue"       // "매출 X원", "$Xm sales"
  | "channel"       // "Costco/Walmart/Sephora/Boots in <country>"
  | "footprint";    // "X 공장", "X factory", "since 19XX"

export interface EchoBiasFinding {
  category: EchoCategory;
  matchedText: string;
  /** Character index in the original text. */
  start: number;
  end: number;
  /** Why this is concerning, surfaced to the user. */
  reason: string;
}

interface PatternDef {
  category: EchoCategory;
  pattern: RegExp;
  reason: string;
}

// Patterns are ordered by specificity. Each pattern uses a capture group to
// pin the match start. /g flag is required so .exec() can scan the whole
// string. Both KO + EN handled in one set — `i` flag lifts EN case sensitivity.
const PATTERNS: PatternDef[] = [
  // RANK — "1위", "rank 1", "top market", "leading"
  {
    category: "rank",
    pattern: /([0-9]+\s*위|rank\s*[0-9]+|top\s*[0-9]+\s*(market|country|brand)|leading\s*(brand|player)\s+in\s+[A-Z][a-z]+)/gi,
    reason: "시장 순위·랭킹 표현 — sim이 추론보다 이 사실을 그대로 echo할 수 있음",
  },
  // SHARE — "점유율 30%", "market share 25%", "30%+"
  {
    category: "share",
    pattern: /([0-9]+\s*%\s*(점유율|점유|market\s*share|share|of\s+the\s+market)|점유율\s*[0-9]+\s*%|market\s*share\s*[0-9]+\s*%)/gi,
    reason: "시장 점유율 수치 — 외부 시장 사실. 제품 본질 설명으로 대체 권장",
  },
  // BESTSELLER — "베스트셀러 in X", "bestseller", "viral on X"
  {
    category: "bestseller",
    pattern: /(베스트셀러|bestseller|best[\s-]?seller|viral\s+(on|in|on\s+(TikTok|Instagram))|TikTok\s+viral|amazon\s+(US|UK|JP)?\s*(best|#1))/gi,
    reason: "베스트셀러·viral 라벨 — 채널 매출 실적 인용. sim이 그 채널/국가를 그대로 추천하는 echo 발생 위험",
  },
  // REVENUE — "매출 1000억", "$5M sales", "해외 매출"
  {
    category: "revenue",
    pattern: /(매출\s*[0-9]+\s*[조억만]|해외\s*매출|overseas\s+revenue|\$[0-9]+\s*[MB]?\s*(in\s+)?(sales|revenue))/gi,
    reason: "매출 수치 — IR 공시 외부 사실. 시뮬 추론에는 불필요하며 echo bias 위험",
  },
  // CHANNEL — well-known retailers tied to a country
  {
    category: "channel",
    pattern: /\b(Costco|Walmart|Target|Whole\s+Foods|Trader\s+Joe['']?s|Sephora|Ulta|Boots|Müller|dm\s+drogerie|Watsons|Sociolla|Eveandboy|Olive\s+Young|H-?Mart)\s+(US|UK|JP|CN|KR|DE|FR|TH|VN|MY|ID|MX)?\b/gi,
    reason: "특정 국가 채널 입점 명시 — sim이 그 국가를 strong-positive로 인식하는 echo 위험",
  },
  // FOOTPRINT — factories, year of entry, "since"
  {
    category: "footprint",
    pattern: /([A-Z]{2,3}\s*공장|[A-Za-z]+\s+공장\s*[0-9]+개|factory\s+in\s+[A-Z][a-z]+|since\s+(19|20)[0-9]{2}|[0-9]{4}\s*년\s*(설립|진출))/g,
    reason: "공장·진출 시점 — 제품의 사업 footprint 사실. sim 추천보다 historical fact를 echo하게 만듦",
  },
];

export function detectEchoBias(text: string): EchoBiasFinding[] {
  if (!text || text.trim().length === 0) return [];
  const findings: EchoBiasFinding[] = [];
  for (const def of PATTERNS) {
    // Reset lastIndex — patterns are module-level constants.
    def.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = def.pattern.exec(text)) !== null) {
      findings.push({
        category: def.category,
        matchedText: m[0],
        start: m.index,
        end: m.index + m[0].length,
        reason: def.reason,
      });
      if (m.index === def.pattern.lastIndex) def.pattern.lastIndex++; // zero-width guard
    }
  }
  // Sort by position so wizard UI can render in document order.
  findings.sort((a, b) => a.start - b.start);
  return findings;
}

/**
 * Summary used in the wizard banner. Returns null when there are no
 * findings (caller renders nothing). Keep this side-effect-free so it
 * can run on every keystroke without thrashing React state.
 */
export function summarizeEchoBias(findings: EchoBiasFinding[]): {
  count: number;
  categories: EchoCategory[];
  preview: string[];
} | null {
  if (findings.length === 0) return null;
  const categories = [...new Set(findings.map((f) => f.category))];
  const preview = findings.slice(0, 3).map((f) => f.matchedText);
  return { count: findings.length, categories, preview };
}
