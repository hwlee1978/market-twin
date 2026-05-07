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
