/**
 * Algorithmic recount of surfacedInSims for merged risks / actions.
 *
 * Background: the merge LLM was instructed to count how many sims
 * contributed semantically-equivalent items to each merged entry,
 * but in practice it consistently under-counts — picks the most
 * detail-rich version from ONE sim and labels surfacedInSims=1 even
 * when 4-5 sims independently surfaced the same root cause.
 *
 * Fix: don't trust the LLM's count. After the LLM merges items,
 * we walk each merged item's text and compute Jaccard similarity
 * against every per-sim raw item; sims with ≥1 item above threshold
 * count as "surfaced". Boring algorithm, reliable behaviour.
 *
 * Tokenisation handles bilingual KO + EN content via:
 *   - lowercase + strip punctuation
 *   - extract alphanumeric / Hangul chunks ≥2 chars
 *   - drop a small KO + EN stopword set (조사 / 일반 동사 어미 / common verbs)
 *   - emit unigrams; for short Korean phrases (<5 tokens) we add
 *     bigrams to compensate for morphological flexibility
 *
 * Threshold 0.20 chosen empirically — captures "ANSM 등록 절차 착수"
 * vs "ANSM 신고 제출" as a match but not "ANSM 규제 컨설턴트 계약" vs
 * "Vine 프로그램 활용". Tunable.
 */

const KO_STOPWORDS = new Set<string>([
  // 조사
  "은", "는", "이", "가", "을", "를", "에", "의", "로", "으로", "와", "과", "도", "만", "까지", "부터", "에서",
  // 시제 어미
  "다", "한다", "합니다", "있다", "있습니다", "없다", "없습니다", "된다", "됩니다",
  // 일반
  "및", "또는", "혹은", "그리고", "그러나", "하지만", "또한", "위해", "위한",
  "대한", "통해", "기반", "관련", "현재", "최소", "최대", "약", "오는", "이내",
  "이상", "이하", "수", "것", "등",
]);

const EN_STOPWORDS = new Set<string>([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "for", "with", "by",
  "from", "as", "is", "are", "was", "were", "be", "been", "being",
  "this", "that", "these", "those", "it", "its", "their", "our", "your",
  "we", "they", "you", "he", "she",
  "via", "into", "onto", "across", "before", "after", "during",
]);

/** Extract meaningful tokens from KO + EN mixed text. */
export function tokenize(text: string): Set<string> {
  if (!text) return new Set();
  // Lowercase + replace any non-alphanumeric / non-Hangul / non-digit
  // with whitespace, then split.
  const cleaned = text
    .toLowerCase()
    // Latin + Hangul + digits + the apostrophe inside e.g. "doesn't"
    .replace(/[^a-z0-9가-힣']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return new Set();
  const raw = cleaned.split(" ");
  const tokens = new Set<string>();
  for (const t of raw) {
    if (t.length < 2) continue;
    if (KO_STOPWORDS.has(t)) continue;
    if (EN_STOPWORDS.has(t)) continue;
    tokens.add(t);
  }
  // For short token sets (<8) add character-level Korean bigrams from
  // every Hangul-only sub-token to widen the match surface. Korean is
  // morphologically dense — "등록", "등록을", "등록의" all share the
  // bigram "등록" so this catches surface-form variations the unigram
  // path misses. Skipped for English (already lemma-friendly).
  if (tokens.size < 8) {
    for (const t of raw) {
      if (t.length < 4) continue;
      if (!/^[가-힣]+$/.test(t)) continue;
      for (let i = 0; i < t.length - 1; i++) {
        tokens.add(t.slice(i, i + 2));
      }
    }
  }
  return tokens;
}

/**
 * Country / regulator / city tokens that should be stripped when
 * doing CROSS-COUNTRY semantic comparisons. Per-country objections
 * naturally embed their own market's anchors ("프랑스 ANSM 절차" vs
 * "영국 MHRA 절차") — without stripping, the same conceptual concern
 * shows zero token overlap and never clusters across markets.
 *
 * Within-country comparisons should NOT use this stripping; the
 * baseline tokenize() is correct there.
 */
const GEO_STRIP_TOKENS = new Set<string>([
  // Country names — Korean
  "한국", "한국산", "프랑스", "영국", "독일", "일본", "중국", "미국",
  "캐나다", "이탈리아", "스페인", "네덜란드", "호주", "싱가포르",
  "말레이시아", "필리핀", "인도", "베트남", "태국", "인도네시아",
  "브라질", "멕시코", "사우디", "uae",
  // Country codes / English
  "kr", "fr", "gb", "uk", "de", "jp", "cn", "us", "usa", "ca", "it", "es",
  "nl", "au", "sg", "my", "ph", "in", "vn", "th", "id", "br", "mx", "sa",
  "korea", "france", "britain", "germany", "japan", "china", "america",
  "canada", "italy", "spain", "australia",
  // Regulators
  "ansm", "mhra", "bfarm", "fda", "kfda", "mfds", "bpom", "mhlw", "pmda",
  "efsa", "tga", "cfia", "fsa", "anvisa", "nmpa",
  // Major cities (some objections cite city names)
  "파리", "리옹", "보르도", "런던", "맨체스터", "베를린", "도쿄",
  "오사카", "북경", "상하이", "베이징", "자카르타", "방콕", "하노이",
  "마닐라", "쿠알라룸푸르", "싱가포르",
]);

/** Tokenise + drop geo anchors. Used only for cross-country matching. */
export function tokenizeStripGeo(text: string): Set<string> {
  const base = tokenize(text);
  for (const t of [...base]) {
    if (GEO_STRIP_TOKENS.has(t)) base.delete(t);
  }
  return base;
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of small) {
    if (large.has(t)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Overlap coefficient — |A ∩ B| / min(|A|, |B|). Better than Jaccard
 * for matching a refined / shortened merged item against a verbose
 * per-sim original: the long version's extra tokens don't dilute the
 * score. We use this instead of Jaccard for surfacedInSims recount.
 */
export function overlapCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of small) {
    if (large.has(t)) intersection++;
  }
  const minSize = Math.min(a.size, b.size);
  return minSize > 0 ? intersection / minSize : 0;
}

/**
 * Count how many sims contributed semantically-equivalent items to a
 * single merged entry. Each `simItems[i]` is one sim's raw item list
 * (e.g. that sim's actionPlan strings, or factor+description for each
 * risk). A sim "supports" the merged entry if at least one of its raw
 * items has overlap coefficient ≥ threshold against the merged text.
 *
 * Why overlap coefficient instead of Jaccard: per-sim raw items are
 * verbose multi-sentence plans; merged items are LLM-refined shorter
 * versions. Jaccard gets diluted by the verbose item's extra tokens
 * (denominator is union). Overlap divides by the smaller set, so a
 * refined item that's mostly contained in a verbose original still
 * scores high.
 *
 * Threshold 0.30 chosen so that "ANSM TPD Article 20 신고 제출" matches
 * "프랑스 ANSM 규제 등록 컨설턴트 계약 및 EU TPD 2 준수 서류 패키지" but
 * not unrelated actions (different cause / different market). Overlap
 * needs to be lower than naive Jaccard's because verbose merged texts
 * have many decoration tokens that won't appear in the shorter per-sim
 * version (timing tags, KPI specifics, etc.).
 *
 * Returns at least 1 — the merged entry itself came from somewhere.
 */
export function recountSurfacedInSims(
  mergedText: string,
  simItems: string[][],
  threshold = 0.2,
): number {
  if (simItems.length === 0) return 1;
  const mergedTokens = tokenize(mergedText);
  if (mergedTokens.size === 0) return 1;
  let count = 0;
  for (const sim of simItems) {
    let supported = false;
    for (const item of sim) {
      const sim2 = overlapCoefficient(mergedTokens, tokenize(item));
      if (sim2 >= threshold) {
        supported = true;
        break;
      }
    }
    if (supported) count++;
  }
  return Math.max(1, count);
}

/**
 * Detects "I'm not in the target audience" objections that aren't real
 * market blockers — same persona type exists in every market sample
 * and the same objection ranks #1 across many markets, drowning out
 * actually-actionable geo-specific blockers (regulatory, pricing,
 * channel). Used by both the source-side aggregator (to filter before
 * clustering) and the PDF render layer (defence-in-depth on legacy
 * data that didn't go through source-side filtering).
 */
export function isPersonaMismatchNoise(text: string): boolean {
  const t = text.toLowerCase();
  // Korean mismatch — generic "not for me" patterns.
  if (
    /아이\s*신발|어린이|유아|성인용|구매\s*동기\s*자체가\s*없음|타겟\s*아님|관심\s*없음|내\s*카테고리\s*아님|이미\s*충분히\s*가지고|제품\s*불필요/.test(
      text,
    )
  ) return true;
  // Korean cessation/vape category-mismatch — non-smoker, vegan,
  // doesn't consume nicotine. Persona type, not market blocker.
  if (
    /비흡연자|흡연\s*경험\s*없|흡연\s*안\s*함|니코틴\s*제품\s*자체.*소비.*않|제품\s*자체.*소비.*않|타깃\s*자체.*해당.*않|카테고리\s*자체.*해당.*없|자신과\s*무관|본인.*해당.*없|개인적.*해당.*없|구매\s*동기\s*자체.*없|흡연자\s*가\s*아니|브랜드\s*이미지.*정면\s*충돌|절대\s*추천\s*불가/.test(
      text,
    )
  ) return true;
  // English mismatch patterns — generic.
  if (
    /\b(not for me|no interest|wrong fit for me|not the target|don'?t need|already have enough|kids?'? shoes?|not in market for|outside my category)\b/.test(
      t,
    )
  ) return true;
  // English cessation/vape mismatch.
  if (
    /\b(non-smoker|never smoked|don'?t smoke|doesn'?t apply to me|category doesn'?t apply|product (?:isn'?t|is not) for me|outside (?:my|the) target)\b/.test(
      t,
    )
  ) return true;
  return false;
}

/**
 * Cluster a flat list of strings (e.g. persona objections, trust
 * factors) by token-overlap similarity. Returns one entry per cluster
 * with the most-frequent surface form as the representative and the
 * total count of members.
 *
 * Used for per-country objections / trustFactors aggregation where
 * exact-text dedup over-fragments natural-language variations of the
 * same concern. Threshold defaults to 0.5 — objections tend to share
 * specific anchor terms (brand name, regulator, price) that survive
 * paraphrasing.
 */
export function clusterStrings(
  items: string[],
  threshold = 0.5,
): Array<{ text: string; count: number }> {
  if (items.length === 0) return [];
  const tokenSets = items.map((s) => tokenize(s));
  const parent = items.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (overlapCoefficient(tokenSets[i], tokenSets[j]) >= threshold) {
        union(i, j);
      }
    }
  }
  const byCluster = new Map<number, Map<string, number>>();
  for (let i = 0; i < items.length; i++) {
    const root = find(i);
    const inner = byCluster.get(root) ?? new Map<string, number>();
    inner.set(items[i], (inner.get(items[i]) ?? 0) + 1);
    byCluster.set(root, inner);
  }
  return [...byCluster.values()].map((inner) => {
    let total = 0;
    for (const c of inner.values()) total += c;
    // Representative = most-frequent surface form, ties broken by
    // shortest (concise reads better in the UI list).
    const rep = [...inner.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].length - b[0].length;
    })[0][0];
    return { text: rep, count: total };
  });
}
