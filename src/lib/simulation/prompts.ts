import type { ProjectInput } from "./schemas";
import type { SimulationAggregate } from "./aggregate";
import { renderAggregateForPrompt } from "./aggregate";
import type { PersonaSlot } from "./profession-pool";

export type PromptLocale = "ko" | "en";

const LANG_NAME: Record<PromptLocale, string> = {
  ko: "Korean (한국어)",
  en: "English",
};

function languageInstruction(locale: PromptLocale): string {
  return `IMPORTANT: All free-form text fields you produce (rationale, descriptions, names of segments, summaries, action items, channel names, objection text, profession titles, etc.) MUST be written in ${LANG_NAME[locale]}. Numerical fields, country codes, enum values like "low"/"medium"/"high", and field keys themselves stay in English.`;
}

const SYSTEM_BASE = `You are AI Market Twin, a B2B platform that simulates consumer behavior across countries to predict product launch outcomes. Your job is to generate realistic, internally consistent synthetic data and scoring that an executive can act on. Be concrete, specific, and avoid generic marketing fluff.`;

/**
 * Per-category hint for what kinds of professions plausibly buy this category,
 * to fight the LLM's tendency to repeat the same 1-2 archetypes (esp. for KR
 * personas in ko-locale runs, which empirically over-index on student/teacher).
 * Soft hint — not a hard constraint — so it shapes the distribution without
 * locking out edge cases.
 */
function categoryProfessionHint(category: string, locale: PromptLocale): string {
  const hints: Record<string, { ko: string; en: string }> = {
    ip: {
      ko: `IP·콘텐츠(웹툰·만화·캐릭터 굿즈·콜렉터블) 타겟 — 한 batch 안에서 최소 6개 이상의 서로 다른 직업이 등장하도록, 아래 직업군 풀에서 골고루 sampling하세요. '대학생'과 '마케팅 매니저' 두 개만 반복하면 INVALID.

  • Creative 산업: 일러스트레이터(프리랜서), 만화·웹툰 작가(데뷔 신인 또는 지망생), 캐릭터 디자이너, 콘셉트 아티스트, 게임 디자이너, 콘텐츠 PD
  • 미디어·유통: 출판사 편집자, 라이선싱·MD 매니저, 콘텐츠 큐레이터, 영상 편집자, 홍보 담당자
  • 팬 경제: 코스플레이어(전업·반전업), 굿즈샵 운영자, 동인 작가(자영업), 콘텐츠 크리에이터·유튜버·스트리머, 인플루언서
  • IT·게임: 게임 개발자, UX 디자이너, 모바일 앱 개발자, 데이터 분석가
  • 인접 직군: 카페·만화방 운영자, 일러스트 학원 강사, 사진작가, 일반 사무직(키덜트 수집가), 자녀 둔 학부모(선물 구매)
  • Always-eligible (단, batch 내 최대 2명): 대학생, 마케팅 매니저, 일반 회사원, 학생`,
      en: `IP / content target — within ONE batch, surface at least 6 distinct professions drawn from the buckets below. If you only produce 'student' and 'marketing manager' the result is INVALID.

  • Creative industry: freelance illustrator, manga/webtoon author (debut or aspiring), character designer, concept artist, game designer, content PD
  • Media & distribution: publishing-house editor, licensing / MD manager, content curator, video editor, PR rep
  • Fan economy: cosplayer (full or part-time), merch-shop owner, doujin author (self-employed), content creator / YouTuber / streamer, influencer
  • Tech & games: game developer, UX designer, mobile app developer, data analyst
  • Adjacent: café / manga-rental owner, illustration academy instructor, photographer, regular office worker (kidult collector), parent buying for children
  • Always-eligible (but cap at 2 per batch): student, marketing manager, generic office worker`,
    },
    beauty: {
      ko: "뷰티 — 사무직·서비스직·자영업·홈메이커·대학생·뷰티 인플루언서·간호사 등 폭넓게, 한 직업에 몰리지 말 것.",
      en: "Beauty — broad mix: office workers, service industry, self-employed, homemakers, students, beauty influencers, nurses. Don't concentrate.",
    },
    food: {
      ko: "식음료 — 가장 폭넓은 소비자층: 모든 직업·연령·라이프스테이지가 잠재 고객. 다양성 최대화.",
      en: "Food & beverage — the broadest consumer base. All professions, ages, life stages welcome. Maximize diversity.",
    },
    saas: {
      ko: "SaaS·소프트웨어 B2B — 의사결정권자 중심: 마케터·세일즈·HR·재무·운영 매니저·CXO·소상공인·프리랜서. 학생·은퇴자 비중 낮게.",
      en: "B2B SaaS — decision-makers: marketers, sales, HR, finance, ops managers, CXOs, small-business owners, freelancers. De-emphasize students/retirees.",
    },
    health: {
      ko: "건강·웰빙 — 30-50대 중심 + 실버 일부. 헬스컨셔스 직장인·운동선수·간호사·약사·홈메이커·은퇴자.",
      en: "Health & wellness — skews 30-50s with some retirees. Health-conscious office workers, athletes, nurses, pharmacists, homemakers.",
    },
    fashion: {
      ko: "패션 — 사무직·서비스직·학생·프리랜서·인플루언서·소상공인 등 폭넓게.",
      en: "Fashion — broad: office workers, service industry, students, freelancers, influencers, small-business owners.",
    },
    electronics: {
      ko: "가전·전자 — 사무직·IT 직군·자영업·자녀 둔 가정·게이머·홈오피스 사용자. 가족 단위와 개인 모두.",
      en: "Electronics — office workers, IT roles, self-employed, parents, gamers, home-office users. Mix family and individual buyers.",
    },
    home: {
      ko: "리빙 — 가정 단위 중심: 1인 가구 직장인·신혼부부·자녀 둔 가정·홈메이커·자취 학생·소형 자영업자.",
      en: "Home & living — household-centric: single workers, newlyweds, families, homemakers, students living alone.",
    },
  };
  const hint = hints[category];
  return hint ? hint[locale] : "";
}

export const PERSONA_SYSTEM = `${SYSTEM_BASE}

For persona generation:
- Vary demographics, professions, life stages, and incomes so the sample reflects real heterogeneity (skeptics + neutrals + champions, not all enthusiastic).
- Every persona MUST include all 11 fields — do not omit any.

═══ TWO SEPARATE RULES — DO NOT CONFUSE ═══

RULE 1 — LANGUAGE OF TEXT FIELDS (HIGHEST PRIORITY — VIOLATIONS ARE CRITICAL ERRORS):
ALL descriptive text fields (profession, purchaseStyle, interests, trustFactors, objections) MUST be written in the SINGLE language requested by the locale at the bottom of the user prompt. THIS RULE OVERRIDES EVERY OTHER INSTINCT.
- A JP persona in a Korean-locale run: profession="영업 매니저" (NOT "営業マネージャー", NOT "Sales Manager", NOT "営業マネージャー (Sales Manager)").
- A US persona in a Korean-locale run: interests=["크로스핏", "매크로 트래킹"] (NOT ["CrossFit", "macro tracking"]).
- A GB persona in a Korean-locale run: profession="마케팅 매니저" (NOT "Marketing Manager", NOT "マーケティングマネージャー").
- An AE persona in a Korean-locale run: profession="IT 매니저" (NOT "ITマネージャー", NOT "IT Manager").
- Mixing languages within ONE field is also wrong: "営業マネージャー (영업 매니저)" is wrong — output ONLY "영업 매니저".

The "country" field is just an ISO code (KR/JP/US/GB/AE/etc) — it controls income currency and cultural realism (Rule 2 below), NOT output language. The country code never switches the text language.

If you find yourself typing Japanese kanji/kana, English words, or any non-Korean characters in any text field while the locale is "ko", STOP and rewrite that field in Korean before emitting it.

RULE 2 — REALISM OF INCOME / VALUES:
Income amounts, currencies, and cultural references must match the persona's COUNTRY, not a US default. The currency symbol and number scale follow the country, while the surrounding label text follows the locale language.

INCOME FORMAT CONSISTENCY:
Every incomeBand using a non-USD currency MUST include the USD equivalent in parentheses for cross-country comparability. Examples:
- KR: "연 ₩45M-₩55M (~$34-42k USD)"
- JP: "年 ¥6M-¥8M (~$43-57k USD)"
- GB: "연 £30k-£45k (~$38-56k USD)"
- AE: "연 AED 120k-180k (~$33-49k USD)"
- ID: "연 Rp 60M-100M (~$3.7-6.2k USD)"
US personas use only "$" with no extra annotation. This rule applies UNIFORMLY across all non-USD countries — never omit the USD parenthetical for one country while including it for another.

═══ INCOME REFERENCE (annual, individual personal income) ═══

Employed personas:
- KR: teacher ₩40-55M (~$30-42k); office worker ₩35-60M (~$27-46k); senior engineer ₩70-110M (~$53-84k); doctor ₩100-200M+ (~$76-150k+).
- JP: regular salaryman ¥4-6M (~$28-43k); senior ¥7-10M (~$50-72k); manager ¥10-15M (~$72-108k).
- US: teacher $50-75k; office worker $55-85k; senior tech $130-200k+; doctor $200-400k.
- VN: office worker ₫120-300M (~$5-12k); senior professional ₫400-800M (~$16-32k).
- TH: office worker ฿300-600k (~$8-17k); manager ฿700k-1.5M (~$20-43k).
- DE: mid-career €45-70k; senior €70-100k.
- AE / SG: expat tech professional $80-160k; locals vary widely.

Non-employed / atypical personas — DO NOT give them salary-like income:
- 대학생 / college student: part-time + 용돈, KR ₩2-10M/yr (~$1.5-7.5k); US $5-15k from part-time; JP ¥500k-2M.
- 주부 / housewife / homemaker: typically NO personal salary — represent as "household income ₩X (남편 ₩Y), 본인 가용 예산 ₩Z" or simply "남편 소득에 의존, 본인 가처분 ₩5-15M/yr".
- 은퇴자 / retiree: pension-based. KR ₩15-30M; JP ¥2-4M; US $20-40k Social Security + savings.
- 프리랜서 / 자영업자 / self-employed: wide range, note variability.
- 무직 / 구직자: minimal or none.

═══ CONSUMER BEHAVIOR ═══
Trust factors, objections, and interests should reflect that country's culture (e.g. KR: 맘카페 후기·식약처 인증; JP: 専門家推薦·品質; US: Reddit·influencer reviews; SG: government-backed health labels).`;

const PERSONA_EXAMPLE_KO = `Example personas (locale = ko, ALL text in Korean even for non-KR personas):

KR 초등학교 교사:
{
  "ageRange": "30-39",
  "gender": "female",
  "country": "KR",
  "incomeBand": "연 ₩45M-₩55M (~$34-42k USD)",
  "profession": "초등학교 교사",
  "interests": ["건강한 식단", "자녀 영양", "필라테스"],
  "purchaseStyle": "원재료와 영양 성분을 꼼꼼히 확인하고 구매",
  "priceSensitivity": "high",
  "trustFactors": ["식약처 인증", "맘카페 후기"],
  "objections": ["가격이 부담스러움", "단백질바는 간식이 아니라 식사 대용 같아 거부감"],
  "purchaseIntent": 45
}

JP 영업 매니저 (country=JP, 그러나 텍스트 필드는 모두 한국어):
{
  "ageRange": "40-49",
  "gender": "male",
  "country": "JP",
  "incomeBand": "연 ¥6M-¥8M (~$43-57k USD)",
  "profession": "영업 매니저",
  "interests": ["골프", "건강 검진", "와인"],
  "purchaseStyle": "전문가 추천을 신뢰하고 품질 우선 구매",
  "priceSensitivity": "low",
  "trustFactors": ["전문가 추천", "오프라인 매장 직접 확인"],
  "objections": ["가격 부담", "익숙한 일본 브랜드를 선호"],
  "purchaseIntent": 55
}

KR 대학생 (비취업, 적은 가처분 소득):
{
  "ageRange": "20-29",
  "gender": "male",
  "country": "KR",
  "incomeBand": "용돈 + 알바 연 ₩4-8M (~$3-6k USD), 부모 지원 별도",
  "profession": "대학생 (경영학 전공)",
  "interests": ["헬스", "프로틴 음료", "유튜브 운동 채널"],
  "purchaseStyle": "가성비 우선, SNS 후기 보고 결정",
  "priceSensitivity": "high",
  "trustFactors": ["인플루언서 리뷰", "쿠팡 평점"],
  "objections": ["가격이 비쌈", "용돈으로 매일 사기 부담"],
  "purchaseIntent": 35
}

KR 주부 (개인 급여 없음):
{
  "ageRange": "40-49",
  "gender": "female",
  "country": "KR",
  "incomeBand": "남편 연 ₩70M, 본인 가처분 월 ₩400-600k 수준",
  "profession": "전업주부",
  "interests": ["가족 건강", "오가닉 식품", "다이어트"],
  "purchaseStyle": "성분표를 직접 확인하고 가족 단위로 구매",
  "priceSensitivity": "high",
  "trustFactors": ["맘카페 후기", "친구 추천"],
  "objections": ["가족 식비에서 추가 지출 부담", "맛이 별로면 가족이 안 먹음"],
  "purchaseIntent": 50
}

US 시니어 소프트웨어 엔지니어 (country=US, 텍스트는 한국어):
{
  "ageRange": "25-34",
  "gender": "male",
  "country": "US",
  "incomeBand": "연 $130-160k",
  "profession": "시니어 소프트웨어 엔지니어",
  "interests": ["크로스핏", "매크로 트래킹", "프리미엄 피트니스 브랜드"],
  "purchaseStyle": "성분이 매크로에 맞으면 프리미엄 브랜드 적극 구매",
  "priceSensitivity": "low",
  "trustFactors": ["Reddit 리뷰", "공인 영양사 추천"],
  "objections": ["일반 단백질바보다 비쌈", "비건 단백질 품질에 의문"],
  "purchaseIntent": 68
}`;

const PERSONA_EXAMPLE_EN = `Example personas (locale = en, ALL text in English even for non-US personas):

KR teacher (country=KR but text in English):
{
  "ageRange": "30-39",
  "gender": "female",
  "country": "KR",
  "incomeBand": "₩45M-₩55M annually (~$34-42k USD)",
  "profession": "Elementary school teacher",
  "interests": ["Healthy eating", "Children's nutrition", "Pilates"],
  "purchaseStyle": "Carefully checks ingredients and nutrition labels before buying",
  "priceSensitivity": "high",
  "trustFactors": ["KFDA certification", "Korean parenting forum reviews"],
  "objections": ["Price feels expensive", "Sees protein bars as meal replacement, not snack"],
  "purchaseIntent": 45
}

KR college student (limited disposable income):
{
  "ageRange": "20-29",
  "gender": "male",
  "country": "KR",
  "incomeBand": "Allowance + part-time ₩4-8M/yr (~$3-6k USD)",
  "profession": "College student (Business major)",
  "interests": ["Gym", "Protein drinks", "YouTube fitness channels"],
  "purchaseStyle": "Value-conscious, decides based on social media reviews",
  "priceSensitivity": "high",
  "trustFactors": ["Influencer reviews", "Coupang ratings"],
  "objections": ["Price is high", "Cannot afford daily on allowance"],
  "purchaseIntent": 35
}

US senior software engineer:
{
  "ageRange": "25-34",
  "gender": "male",
  "country": "US",
  "incomeBand": "$130-160k annually",
  "profession": "Senior Software Engineer",
  "interests": ["CrossFit", "Macro tracking", "Premium fitness brands"],
  "purchaseStyle": "Buys premium brands when ingredients align with macros",
  "priceSensitivity": "low",
  "trustFactors": ["Reddit reviews", "Registered dietitian endorsements"],
  "objections": ["Generic protein bars are cheaper", "Skeptical of vegan protein quality"],
  "purchaseIntent": 68
}`;

export function personaPrompt(
  input: ProjectInput,
  slots: PersonaSlot[],
  locale: PromptLocale = "en",
  /**
   * Optional pre-formatted block of government-statistics reference data
   * (income by profession, consumer norms, etc.). When present, the LLM should
   * anchor its output to these values instead of relying on its training prior.
   */
  referenceBlock: string = "",
): string {
  const example = locale === "ko" ? PERSONA_EXAMPLE_KO : PERSONA_EXAMPLE_EN;
  const count = slots.length;

  // When every slot carries a pre-assigned profession, we render an explicit
  // numbered list — the LLM produces ONE persona per slot, in order, matching
  // both the country and the base profession we assigned. This is what
  // guarantees across-batch profession diversity (parallel batches each get
  // disjoint slot slices).
  const allSlotsHaveProfession = slots.every((s) => s.profession);
  const distributionInstruction = allSlotsHaveProfession
    ? `MANDATORY persona slot assignments — produce EXACTLY ${count} personas in array order, each matching its slot's country code AND base profession. Slot order is the order in your output array.

${slots.map((s, i) => `  Slot ${i + 1}: country=${s.country}, base profession=${s.profession}`).join("\n")}

Rules:
- The persona's "country" field MUST equal the slot's country code.
- The persona's "profession" field MUST start with the assigned base profession. You MAY add a parenthetical specialization to make it concrete (e.g. "프리랜서 일러스트레이터 (게임 컨셉 아트 전문)" or "Senior software engineer (Tokyo fintech)"), but the base must match.
- If an assigned profession doesn't naturally fit the slot's country, adapt to the closest local equivalent BUT keep the same base archetype.
- Everything else (age, gender, income, intent, objections, trust factors, interests, purchase style) is YOUR creative judgment — vary widely across slots so the personas feel distinct.`
    : `Distribute personas across these countries (exact counts):
${Object.entries(
        slots.reduce<Record<string, number>>((acc, s) => {
          acc[s.country] = (acc[s.country] ?? 0) + 1;
          return acc;
        }, {}),
      )
        .map(([c, n]) => `  • ${c}: exactly ${n}`)
        .join("\n")}

If you produce more or fewer of any country than specified above, the result is INVALID.`;

  const referenceSection = referenceBlock
    ? `\n${referenceBlock}

═══ REFERENCE DATA ADHERENCE (mandatory) ═══
When a persona matches a profession+age+life_stage row above, use the displayed income text VERBATIM as the persona's incomeBand — do NOT paraphrase, simplify, or convert to a single-currency salary. Specifically:
- Homemakers (전업주부): incomeBand MUST follow the household-format shown in the reference (e.g. "본인 급여 없음. 가구소득 연 ₩60M-₩90M, 본인 가처분 월 ₩300k-₩600k"). NEVER write a salary-like number for a homemaker.
- Students (대학생/고등학생): incomeBand MUST follow the allowance+part-time format shown (e.g. "용돈+알바 연 ₩2M-₩9M (~$1.5-7k USD), 부모 지원 별도"). NEVER write a salary-like number for a student.
- Retirees (은퇴자): incomeBand MUST follow the pension format shown.

For professions NOT in the reference (or for non-KR personas), interpolate plausibly from the closest listed entries and the country's pay norms in the system prompt.
`
    : "";

  return `Generate EXACTLY ${count} distinct consumer personas who could plausibly evaluate this product. Do not return fewer than ${count} — the array length must equal ${count}.

Product: ${input.productName}
Category: ${input.category}
Description: ${input.description}
Base price: ${(input.basePriceCents / 100).toFixed(2)} ${input.currency}
Launch objective: ${input.objective}
Origin (the company exporting this product, NOT a candidate market): ${input.originatingCountry}
Candidate target markets (overseas, where personas live): ${input.candidateCountries.join(", ")}
Competitor references: ${input.competitorUrls.length ? input.competitorUrls.join(", ") : "none"}

Each persona is a CONSUMER in their candidate target market evaluating an imported ${input.originatingCountry}-origin product. Their objections / trust factors / interests should reflect a foreign-market buyer's view of an imported brand (cultural translation distance, official-import channel concerns, price-relative-to-local-equivalents, etc.).

${distributionInstruction}

Mix in different life stages — not just full-time professionals. Include some students, homemakers, retirees, freelancers, or part-time workers where they realistically belong in the target market.${
    allSlotsHaveProfession
      ? "" // Slot-level profession assignment already guarantees diversity.
      : `

═══ PROFESSION DIVERSITY RULE (mandatory — violations are CRITICAL ERRORS) ═══
HARD LIMIT: in a batch of ${count} personas, the SAME base profession may appear AT MOST 2 times. Producing 3+ personas of the same base profession (even with different specializations) makes the entire batch INVALID.

What counts as "same base profession":
- "대학생 (시각디자인 전공)" + "대학생 (애니메이션 동아리)" + "대학생 (만화 동아리)" → ALL student. Same base. Maximum 2 of these in this batch.
- "마케팅 매니저 (테크 스타트업)" + "마케팅 매니저 (엔터테인먼트)" → both Marketing Manager. Maximum 2.
- "시니어 소프트웨어 엔지니어 (런던)" + "시니어 소프트웨어 엔지니어 (도쿄)" → same. Maximum 2.

Force yourself to use at least ${Math.max(6, Math.ceil(count / 2))} DIFFERENT base professions across this batch.${
          categoryProfessionHint(input.category, locale)
            ? `\n\n═══ CATEGORY-SPECIFIC PROFESSION HINT ═══\n${categoryProfessionHint(input.category, locale)}`
            : ""
        }`
  }

CRITICAL constraints (re-read the system prompt rules):
- ALL text fields (profession, purchaseStyle, interests, trustFactors, objections) in the LOCALE language — even for non-${locale.toUpperCase()} personas. Do NOT switch to the country's native language.
- incomeBand realistic for the persona's country AND life stage. A student or homemaker MUST NOT have a salary-like figure.
- purchaseIntent (0-100) honest — distribution should include skeptics (low), neutrals, and a few champions.
${referenceSection}
${example}

${languageInstruction(locale)}

Return a JSON object: { "personas": [ ...${count} persona objects, each with all 11 fields ] }`;
}

export const COUNTRY_SYSTEM = `${SYSTEM_BASE} For country scoring, weigh demand signals, competitive density, customer-acquisition cost realism, and cultural fit. Rank from best to worst.`;

export function countryPrompt(
  input: ProjectInput,
  aggregate: SimulationAggregate,
  locale: PromptLocale = "en",
): string {
  return `Rank these candidate OVERSEAS-EXPANSION TARGET MARKETS for launching the product below. The company is based in ${input.originatingCountry} (the origin / home market) and is validating overseas expansion — score each candidate as an EXPORT TARGET, not as a domestic market. The persona stats below are the bounded grounding signal — read them carefully (intent histograms, top objections, top trust signals, profession mix per country) before incorporating market structure (competition, CAC realism, regulatory friction, cultural fit, distance from origin).

CRITICAL: Only include countries from the candidate list. Do NOT add countries that are not in the list. Do NOT include the origin (${input.originatingCountry}) in the ranking — it is the home market, not a target.

Origin (home market, NOT a target): ${input.originatingCountry}
Product: ${input.productName} (${input.category})
Description: ${input.description}
Base price: ${(input.basePriceCents / 100).toFixed(2)} ${input.currency}
Objective: ${input.objective}
Candidate target markets (ONLY these allowed): ${input.candidateCountries.join(", ")}

${renderAggregateForPrompt(aggregate, locale)}

${languageInstruction(locale)}

Return a JSON object: { "countries": [ { country, demandScore, cacEstimateUsd, competitionScore, finalScore, rank, rationale } ] } — sorted by rank ascending (1 = best). country must be one of: ${input.candidateCountries.join(", ")}.`;
}

export const PRICING_SYSTEM = `${SYSTEM_BASE} For pricing, model how conversion changes across price points — typically conversion drops as price rises, but not linearly. Identify the revenue-maximizing point.`;

export function pricingPrompt(
  input: ProjectInput,
  aggregate: SimulationAggregate,
  locale: PromptLocale = "en",
): string {
  return `Generate a pricing curve for this product. Sample 7-10 price points around the base price (from 0.5x to 2.0x). For each point, estimate conversion probability (0-1) and a revenue index (price * conversion, normalized).

Product: ${input.productName} (${input.category})
Base price: ${(input.basePriceCents / 100).toFixed(2)} ${input.currency}
Persona price sensitivity (overall): ${JSON.stringify(aggregate.overall.priceSensitivity)}
Per-country sensitivity:
${aggregate.byCountry
  .map(
    (c) =>
      `  ${c.country}: low=${c.priceSensitivity.low} / med=${c.priceSensitivity.medium} / high=${c.priceSensitivity.high} (n=${c.count}, mean intent ${c.intentMean})`,
  )
  .join("\n")}

${languageInstruction(locale)}

Return: { "recommendedPriceCents": int, "marginEstimate": "string description (in ${LANG_NAME[locale]})", "curve": [ { priceCents, conversionProbability, estimatedRevenueIndex } ] }`;
}

export const SYNTHESIS_SYSTEM = `${SYSTEM_BASE} For final synthesis, distill the analysis into an executive-readable verdict with a clear go/no-go signal, the highest-leverage action plan, and honest risks.`;

export function synthesisPrompt(
  input: ProjectInput,
  aggregate: SimulationAggregate,
  countriesJson: string,
  pricingJson: string,
  locale: PromptLocale = "en",
): string {
  // The LLM's training cutoff is older than "now" — without this anchor it
  // routinely refers to past events ("Japan Expo 2025", "MCM Comic Con 2024
  // London") as upcoming, which makes the action plan unusable. Inject today
  // so every "D-X / D+X" timeline anchors to a real future date.
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getUTCFullYear();
  const dateContext =
    locale === "ko"
      ? `오늘 날짜: ${today}. 액션 플랜의 모든 날짜·이벤트는 오늘 이후로만 참조하세요. 이미 지난 이벤트(예: ${currentYear - 1}년 행사)를 미래 이벤트인 것처럼 적지 마세요. 일본 Japan Expo·UK MCM Comic Con 같은 연례 이벤트는 ${currentYear}년 또는 ${currentYear + 1}년 회차로 명시하세요.`
      : `Today's date: ${today}. Anchor every action-plan date / event reference to AFTER today. Do NOT cite past events (e.g. ${currentYear - 1} editions) as upcoming. For annual events like Japan Expo, MCM Comic Con, Comic-Con etc., reference the ${currentYear} or ${currentYear + 1} edition explicitly.`;

  return `Produce the final executive verdict for this OVERSEAS-EXPANSION launch simulation. The company is based in ${input.originatingCountry} (origin / home market) and is validating expansion into the candidate overseas markets below. Treat the analysis strictly as an export-validation report — DO NOT recommend launching in ${input.originatingCountry} as if it were a target market, and do not include domestic-channel action items (e.g. ${input.originatingCountry === "KR" ? "스마트스토어·네이버 쇼핑·KR-internal channels" : "home-market-only retail or distribution"}). The bestCountry field MUST be one of the candidate overseas targets, never the origin.

${dateContext}

Origin (home market, NOT a target): ${input.originatingCountry}
Product: ${input.productName} (${input.category}) — ${input.description}
Base price: ${(input.basePriceCents / 100).toFixed(2)} ${input.currency}
Objective: ${input.objective}
Country scores (JSON): ${countriesJson}
Pricing analysis (JSON): ${pricingJson}

${renderAggregateForPrompt(aggregate, locale)}

${languageInstruction(locale)}

Return a JSON object:
{
  "overview": {
    "successScore": 0-100,
    "bestCountry": "country code, must be from: ${input.candidateCountries.join(", ")}",
    "bestSegment": "concise persona description in ${LANG_NAME[locale]}",
    "bestPriceCents": int,
    "bestCreative": null,
    "riskLevel": "low|medium|high",
    "headline": "one-sentence verdict in ${LANG_NAME[locale]}"
  },
  "creative": [],
  "risks": [ { "factor": "(in ${LANG_NAME[locale]})", "severity": "low|medium|high", "description": "(in ${LANG_NAME[locale]})" } ],
  "recommendations": {
    "executiveSummary": "2-3 paragraphs in ${LANG_NAME[locale]}",
    "actionPlan": [ "concrete steps in ${LANG_NAME[locale]}" ],
    "channels": [ "channel names — keep brand names like TikTok, Instagram in original" ]
  }
}`;
}
