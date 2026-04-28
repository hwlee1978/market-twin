import type { ProjectInput, Persona } from "./schemas";

export type PromptLocale = "ko" | "en";

const LANG_NAME: Record<PromptLocale, string> = {
  ko: "Korean (한국어)",
  en: "English",
};

function languageInstruction(locale: PromptLocale): string {
  return `IMPORTANT: All free-form text fields you produce (rationale, descriptions, names of segments, summaries, action items, channel names, objection text, profession titles, etc.) MUST be written in ${LANG_NAME[locale]}. Numerical fields, country codes, enum values like "low"/"medium"/"high", and field keys themselves stay in English.`;
}

const SYSTEM_BASE = `You are AI Market Twin, a B2B platform that simulates consumer behavior across countries to predict product launch outcomes. Your job is to generate realistic, internally consistent synthetic data and scoring that an executive can act on. Be concrete, specific, and avoid generic marketing fluff.`;

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
  count: number,
  locale: PromptLocale = "en",
  /**
   * Optional pre-formatted block of government-statistics reference data
   * (income by profession, consumer norms, etc.). When present, the LLM should
   * anchor its output to these values instead of relying on its training prior.
   */
  referenceBlock: string = "",
): string {
  const example = locale === "ko" ? PERSONA_EXAMPLE_KO : PERSONA_EXAMPLE_EN;
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
Candidate countries: ${input.candidateCountries.join(", ")}
Competitor references: ${input.competitorUrls.length ? input.competitorUrls.join(", ") : "none"}

Distribute personas roughly evenly across the candidate countries. Mix in different life stages — not just full-time professionals. Include some students, homemakers, retirees, freelancers, or part-time workers where they realistically belong in the target market.

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
  personas: Persona[],
  locale: PromptLocale = "en",
): string {
  const intentByCountry = personas.reduce<Record<string, number[]>>((acc, p) => {
    (acc[p.country] ??= []).push(p.purchaseIntent);
    return acc;
  }, {});
  const summary = Object.entries(intentByCountry)
    .map(
      ([c, arr]) =>
        `${c}: n=${arr.length}, avg_intent=${(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)}`,
    )
    .join("\n");

  return `Rank these candidate countries for launching the product below. Use the persona intent summary as one input, but also incorporate market structure (competition, CAC realism, regulatory friction, cultural fit).

CRITICAL: Only include countries from the candidate list. Do NOT add countries that are not in the list.

Product: ${input.productName} (${input.category})
Description: ${input.description}
Base price: ${(input.basePriceCents / 100).toFixed(2)} ${input.currency}
Objective: ${input.objective}
Candidate countries (ONLY these allowed): ${input.candidateCountries.join(", ")}

Persona intent summary by country:
${summary}

${languageInstruction(locale)}

Return a JSON object: { "countries": [ { country, demandScore, cacEstimateUsd, competitionScore, finalScore, rank, rationale } ] } — sorted by rank ascending (1 = best). country must be one of: ${input.candidateCountries.join(", ")}.`;
}

export const PRICING_SYSTEM = `${SYSTEM_BASE} For pricing, model how conversion changes across price points — typically conversion drops as price rises, but not linearly. Identify the revenue-maximizing point.`;

export function pricingPrompt(
  input: ProjectInput,
  personas: Persona[],
  locale: PromptLocale = "en",
): string {
  const sensitivityCounts = personas.reduce<Record<string, number>>((acc, p) => {
    acc[p.priceSensitivity] = (acc[p.priceSensitivity] ?? 0) + 1;
    return acc;
  }, {});

  return `Generate a pricing curve for this product. Sample 7-10 price points around the base price (from 0.5x to 2.0x). For each point, estimate conversion probability (0-1) and a revenue index (price * conversion, normalized).

Product: ${input.productName} (${input.category})
Base price: ${(input.basePriceCents / 100).toFixed(2)} ${input.currency}
Persona price sensitivity distribution: ${JSON.stringify(sensitivityCounts)}

${languageInstruction(locale)}

Return: { "recommendedPriceCents": int, "marginEstimate": "string description (in ${LANG_NAME[locale]})", "curve": [ { priceCents, conversionProbability, estimatedRevenueIndex } ] }`;
}

export const SYNTHESIS_SYSTEM = `${SYSTEM_BASE} For final synthesis, distill the analysis into an executive-readable verdict with a clear go/no-go signal, the highest-leverage action plan, and honest risks.`;

export function synthesisPrompt(
  input: ProjectInput,
  personas: Persona[],
  countriesJson: string,
  pricingJson: string,
  locale: PromptLocale = "en",
): string {
  const avgIntent =
    personas.reduce((s, p) => s + p.purchaseIntent, 0) / Math.max(personas.length, 1);

  return `Produce the final executive verdict for this launch simulation.

Product: ${input.productName} (${input.category}) — ${input.description}
Base price: ${(input.basePriceCents / 100).toFixed(2)} ${input.currency}
Objective: ${input.objective}
Personas analyzed: ${personas.length}, avg purchase intent: ${avgIntent.toFixed(1)}/100
Country scores (JSON): ${countriesJson}
Pricing analysis (JSON): ${pricingJson}

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
