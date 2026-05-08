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
 * Anchor regex — tests whether a trustFactor / objection contains AT
 * LEAST ONE concrete signal: a real brand / product name (CamelCase
 * Latin word), a specific cert / regulator (GOTS, KFDA, FDA, OEKO,
 * Bluesign, RWS, B Corp, etc.), a named channel / retailer (Coupang,
 * Sephora, Reddit, Wirecutter, Amazon, Olive Young, ZOZOTOWN, etc.),
 * a price comparator (currency + number, 대비, 보다, vs), or a
 * scenario quantifier (월/연/일 + number, 시즌, 기내, 등산, 출퇴근,
 * 웨딩, refill, subscription, monthly).
 *
 * Used as the gating predicate for `isBareAdjectiveSignal` — any
 * short-text trustFactor / objection without one of these anchors is
 * considered LLM safe-default noise and dropped at runtime regardless
 * of locale or category.
 */
const ANCHOR_REGEX =
  /[A-Z][a-zA-Z]{2,}|\$\s*\d|₩\s*\d|€\s*\d|£\s*\d|¥\s*\d|\d\s*(?:원|달러|만원|USD|TWD|JPY|EUR|GBP|RMB|SGD|HKD|TWD)|월\s*\d|연\s*\d|일\s*\d|구독|재구매|refill|subscription|monthly|annually|대비|보다|vs\b|시즌|계절|웨딩|기내|등산|출퇴근|회복|gift|선물|allbirds|coupang|sephora|reddit|wirecutter|amazon|olive\s*young|zozo|qoo10|cosme|tabelog|kakaku|cult\s*beauty|john\s*lewis|currys|costco|prime|stylevana|yesstyle|gots|oeko|kfda|mfds|fda|kc\s*인증|bluesign|rws|b\s*corp|ce\s*인증|식약처|산업부|환경부|hsa|cfia|ansm|mhra|bfarm|tga|nmpa|ko\s*인증|cpsc|epa|reach|rohs|iso\s*\d/i;

/**
 * Bare-adjective signal detector — short trustFactor / objection
 * strings that lack a concrete anchor. Generic adjectives ("편안한
 * 착용감", "comfort", "메리노 울 부드러움", "디자인 좋음", "가격이
 * 높음", "내구성 의문", "브랜드 인지도 낮음") consistently surface as
 * the LLM's safe-default for >90% of personas across every category /
 * locale, drowning out the actually-differentiating long-tail signals.
 *
 * Strategy: any trustFactor / objection ≤ 22 chars (covers most KO/EN
 * bare-adjective strings — anchored ones tend to be longer because
 * the anchor itself adds chars) without a match against ANCHOR_REGEX
 * is rejected. Anchored short strings ("Allbirds 대비 비쌈" — 14 ch
 * but contains a brand) survive because the regex matches.
 *
 * This is the LAST line of defense — runs at the surfaced-recount /
 * aggregator stage AFTER the LLM has already emitted, regardless of
 * whether the prompt was followed. Together with the prompt-level
 * anchor requirement and temperature bump, it guarantees the visible
 * top-N never shows bare adjectives even if the LLM lapses.
 */
export function isBareAdjectiveSignal(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return false;
  if (t.length > 22) return false;
  return !ANCHOR_REGEX.test(t);
}

/**
 * Generic, contextless trust factors — category defaults the LLM
 * emits as a safe slot-filler for almost every persona regardless of
 * profile. Le Mouton TW run produced 99% "편안한 착용감" + 1%
 * "커뮤니티 추천" + 0% / 0% / 0% — the chart became unreadable
 * because one default absorbed every signal slot and the actually
 * differentiating trust factors (Allbirds positioning, color styling,
 * brand-origin claims) sat at 0%.
 *
 * Specific trust factors that DO add signal — "Allbirds 대비 가격
 * 우위", "GOTS 인증", "Coupang Rocket 배송", "Wirecutter 추천" —
 * survive the filter because they include a brand / certification /
 * channel name or exceed the length threshold.
 */
export function isGenericTrustFactor(text: string): boolean {
  const t = text.trim();
  if (t.length > 16) return false;
  const lower = t.toLowerCase();
  const hasGenericKeyword =
    /편안|편함|편하|착용감|품질|좋아\s*보|좋을\s*것|마음에\s*들|디자인\s*(좋|예쁜?|훌륭)|comfort|comfortable|good\s+(quality|design|fit|look)|nice|appealing|stylish|trendy/i.test(
      t,
    );
  if (!hasGenericKeyword) return false;
  // Specific anchors override the generic flag — brand mention,
  // certification, channel name, currency / number, recurring frame.
  const hasSpecificAnchor =
    /[A-Z][a-zA-Z]{2,}|\$\s*\d|\d\s*(?:원|달러|만원)|인증|certified|cert|보증|warranty|쿠팡|올리브영|네이버|Coupang|Sephora|Reddit|Wirecutter|Amazon/.test(
      lower,
    );
  return !hasSpecificAnchor;
}

/**
 * Demote dominant clusters from a top-N list. When a single cluster
 * absorbs >shareThreshold of the persona pool, it stops being a
 * "differentiating" signal — every persona raised it, so it's a
 * consensus baseline. Burying it at top-1 also crowds out the actually
 * distinctive top-2-to-top-5 entries because they get reduced to "<1%".
 *
 * Strategy: pull dominant clusters out of the head, append them at
 * the end with their share intact. The top of the list now surfaces
 * the four next-most-common (which are the actually-differentiating
 * concerns/trusts), and the dominant cluster still appears so the
 * reader knows it's a universal signal.
 *
 * Pure structural fix — content-agnostic, works regardless of which
 * specific phrase the LLM emitted as its safe default. Complements
 * the content-based isGeneric* predicates by handling LLM-default
 * patterns the predicates haven't been taught yet.
 */
export function demoteDominantClusters<
  T extends { count: number },
>(
  items: T[],
  personaCount: number,
  shareThreshold = 0.6,
): T[] {
  if (personaCount <= 0) return items;
  const dominant: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    if (item.count / personaCount >= shareThreshold) dominant.push(item);
    else rest.push(item);
  }
  // Sort each group by count desc, then concatenate rest first so
  // the differentiating entries take the visible top slots and the
  // dominant cluster moves to the tail.
  rest.sort((a, b) => b.count - a.count);
  dominant.sort((a, b) => b.count - a.count);
  return [...rest, ...dominant];
}

/**
 * Generic launch / new-entrant concerns. "브랜드 인지도 낮음" and
 * "가격 대비 내구성 의문" surface in 89-91% of personas across every
 * country for any new-to-market product — they're definitionally
 * true (new brand = low awareness, untested product = durability
 * uncertain) and add zero comparative signal between markets. Same
 * pattern as generic price grumbles + generic trust factors.
 *
 * Specific concerns that DO add signal — \"S$116은 웨딩 하객용으로는
 * 부담\" (specific price + use case), \"GOTS 인증 여부 명시 안 됨\"
 * (specific certification), \"£60이면 ASOS에서 비슷한 디자인 £30에
 * 있음\" (specific competitor + price) — survive because they exceed
 * the length threshold or include a brand / number / certification
 * / scenario anchor.
 */
export function isGenericLaunchConcern(text: string): boolean {
  const t = text.trim();
  if (t.length > 20) return false;
  const lower = t.toLowerCase();
  // Brand-awareness / new-entrant / unknown-brand grumbles.
  const isBrandAwareness =
    /(브랜드\s*인지도\s*(낮|부족|없)|인지도\s*(낮|부족|없)|브랜드\s*(생소|모름|미인지|신뢰\s*부족)|신뢰성\s*(부족|없)|low\s+brand\s+(awareness|recognition)|unknown\s+brand|unfamiliar\s+brand)/i.test(
      t,
    );
  // Durability uncertainty without specific test / time / context.
  const isDurabilityVague =
    /(가격\s*대비\s*내구성\s*(의문|우려|걱정|불안)|내구성\s*(의문|우려|걱정|불안)|durability\s+(concern|question|uncertain)|long-term\s+wear)/i.test(
      t,
    );
  if (!isBrandAwareness && !isDurabilityVague) return false;
  // Specific anchors override the generic flag.
  const hasSpecificAnchor =
    /[A-Z][a-zA-Z]{2,}|\$\s*\d|\d\s*(?:원|달러|만원|USD|TWD|JPY|EUR|GBP)|월\s*\d|구독|재구매|refill|subscription|monthly|annually|대비|보다|시즌|계절|웨딩|기내/.test(
      lower,
    );
  return !hasSpecificAnchor;
}

/**
 * Generic, contextless price grumbles ("가격이 높음" / "비쌈" /
 * "expensive") that surface in nearly every consumer-product run
 * regardless of actual price. Used to be a cross-country blocker-table
 * problem (every market shows the same answer); turns out it's also
 * dominating per-country Top 5 — a Le Mouton TW run had 98% of
 * personas raising "가격이 다소 높음" while the real differentiating
 * blockers (climate fit, color range, scene alignment) sat at 1-2%.
 *
 * Specific price objections that DO add signal — \"Allbirds 대비 비쌈\",
 * \"월 구독료 부담\", \"$150 is steep for a knit shoe\" — survive the
 * filter because they exceed 18 chars or include a brand / number /
 * comparator anchor.
 */
export function isGenericPriceObjection(text: string): boolean {
  const t = text.trim();
  if (t.length > 18) return false;
  const lower = t.toLowerCase();
  const hasPriceKeyword =
    /가격|비싸|비쌈|부담|고가|expensive|costly|pricey|too\s+(high|much)/i.test(
      t,
    );
  if (!hasPriceKeyword) return false;
  const hasSpecificAnchor =
    /[A-Z][a-zA-Z]{2,}|\$\s*\d|\d\s*(?:원|달러|만원|USD|TWD|JPY|EUR)|월\s*\d|구독|재구매|refill|subscription|monthly|annually|대비|보다/.test(
      lower,
    );
  return !hasSpecificAnchor;
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
  opts?: { personaIds?: number[] },
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
  // Two-mode counting:
  //   - default (no personaIds): total instances per cluster — every
  //     occurrence of the text counts. Used for cross-sim aggregation
  //     where each occurrence is a fresh independent signal.
  //   - personaIds supplied: unique persona count per cluster. Used
  //     for per-country "% of personas who raised this concern" math
  //     where instance-count would exceed persona-count (one persona
  //     can list 3-5 objections; a top cluster aggregating across
  //     ~150 personas easily clears 200 instances → 169% 가격이 높음).
  const personaIds = opts?.personaIds;
  const byCluster = new Map<
    number,
    { texts: Map<string, number>; personas: Set<number> }
  >();
  for (let i = 0; i < items.length; i++) {
    const root = find(i);
    const cur =
      byCluster.get(root) ??
      ({ texts: new Map<string, number>(), personas: new Set<number>() });
    cur.texts.set(items[i], (cur.texts.get(items[i]) ?? 0) + 1);
    if (personaIds) cur.personas.add(personaIds[i]);
    byCluster.set(root, cur);
  }
  return [...byCluster.values()].map(({ texts, personas }) => {
    // Representative = most-frequent surface form, ties broken by
    // shortest (concise reads better in the UI list).
    const rep = [...texts.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].length - b[0].length;
    })[0][0];
    let total: number;
    if (personaIds) {
      total = personas.size;
    } else {
      total = 0;
      for (const c of texts.values()) total += c;
    }
    return { text: rep, count: total };
  });
}
