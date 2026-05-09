import type { ProjectInput } from "./schemas";
import type { SimulationAggregate } from "./aggregate";
import { renderAggregateForPrompt } from "./aggregate";
import type { PersonaSlot } from "./profession-pool";
import { buildChannelCostsBlock } from "@/lib/reference/channel-costs";
import { taxonomyPromptBlock } from "./taxonomy";

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
- Every persona MUST include all 12 fields — do not omit any.

═══ TWO SEPARATE RULES — DO NOT CONFUSE ═══

RULE 1 — LANGUAGE OF TEXT FIELDS (HIGHEST PRIORITY — VIOLATIONS ARE CRITICAL ERRORS):
ALL descriptive text fields (profession, purchaseStyle, interests, trustFactors, objections, voice) MUST be written in the SINGLE language requested by the locale at the bottom of the user prompt. THIS RULE OVERRIDES EVERY OTHER INSTINCT.
- A JP persona in a Korean-locale run: profession="영업 매니저" (NOT "営業マネージャー", NOT "Sales Manager", NOT "営業マネージャー (Sales Manager)").
- A JP persona in a Korean-locale run: voice="Qoo10에서 쿠폰 뜨면 바로 사봐야겠어요" (NOT "Qoo10のクーポンで安くなったら絶対買う", NOT "@cosmeのレビューを読んでから決める"). **THIS IS THE MOST FREQUENT SLIP** — Japanese-context content (Qoo10 / @cosme / ドラッグストア / 厚生労働省) heavily biases output toward Japanese. Resist that bias. Reference those Japanese channels by name but write the surrounding sentence in Korean.
- A US persona in a Korean-locale run: interests=["크로스핏", "매크로 트래킹"] (NOT ["CrossFit", "macro tracking"]).
- A US persona in a Korean-locale run: voice="$25면 한 번 써볼 만해요" (NOT "$25 is worth trying").
- A GB persona in a Korean-locale run: profession="마케팅 매니저" (NOT "Marketing Manager", NOT "マーケティングマネージャー").
- An AE persona in a Korean-locale run: profession="IT 매니저" (NOT "ITマネージャー", NOT "IT Manager").
- Mixing languages within ONE field is also wrong: "営業マネージャー (영업 매니저)" or "成分表で確認 못 해요" — output ONLY in the locale language.

═══ BRAND / CHANNEL NAME PRESERVATION ═══
Brand and channel names are preserved in their canonical real-world form, NOT translated, even when a literal translation produces a valid Korean word. The brand IS the name — translating it creates a non-existent entity.
- Japanese channels with Korean cognates (frequent slip risk):
  - **kakaku.com** (or 価格.com) — Japan's #1 price comparison site. WRITE "kakaku.com". DO NOT translate to "가격.com" — that domain does not exist. The site name is "kakaku", not "price".
  - **Tabelog** (食べログ) — Japan's #1 restaurant review site. WRITE "Tabelog" or "타베로그". DO NOT translate to "먹로그" or "식사로그".
  - **Mercari** (メルカリ) — secondhand marketplace. WRITE "Mercari" or "메르카리". DO NOT translate.
  - **Rakuten** (楽天) — write "Rakuten" or "라쿠텐". DO NOT translate to "낙천".
  - **Yodobashi** (ヨドバシカメラ) — write "Yodobashi" or "요도바시카메라".
- Already in Latin script — preserve as-is: Qoo10, @cosme, Amazon Japan, Costco, Wirecutter, Reddit, Sephora, Stylevana, YesStyle, Cult Beauty, Look Fantastic, John Lewis, Currys.
- Government bodies and physical chains may be transliterated to Hangul: 厚生労働省 → "후생노동성", ヤマダ電機 → "야마다전기", ビックカメラ → "빅카메라". This is acceptable because the target reader (a Korean executive) is more likely to recognize the Hangul rendering than the original kana/kanji. But the rule is preserve > transliterate > translate. Only translate when the translation matches an established Korean term (e.g. "외무성" for foreign ministry).

The "country" field is just an ISO code (KR/JP/US/GB/AE/etc) — it controls income currency and cultural realism (Rule 2 below), NOT output language. The country code never switches the text language.

If you find yourself typing Japanese kanji/kana (ひらがな・カタカナ・漢字), English words, or any non-Korean characters in any text field while the locale is "ko", STOP and rewrite that field in Korean before emitting it. Voice is the most slip-prone field — re-check every voice for hiragana/katakana/Latin sentences before output.

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

INCOME RANGE WIDTH (HARD RULE):
The range you emit must be **TIGHT** — high end at most ~50% above the low end (so a $130k mid-career persona writes "$110-150k" or "$120-145k", NOT "$80-200k"). Wide ranges like "$50-200k" mask the persona's actual seniority and produce unreliable income-bracket bucketing downstream. The range should describe ONE persona's realistic year-to-year variation (bonus / commission / stipend), not the entire profession's pay band. If you find yourself wanting a wider range, pick a single midpoint and set tight bounds around it.

═══ INCOME REFERENCE (annual, individual personal income) ═══

Each country lists entry / mid / senior / executive tiers where applicable.
LLM MUST anchor to the slot's profession seniority — do NOT default to
country-median for every persona regardless of profession. A "senior
software engineer" in any developed country should be solidly senior-
tier, not mid-tier. An "executive" / "임원" / "役員" / "dirigeant" /
"director" slot in a developed country routinely clears USD $150k.

Employed personas:
- **KR**: teacher ₩40-55M (~$30-42k); office worker ₩35-60M (~$27-46k); senior engineer ₩70-110M (~$53-84k); doctor / specialist ₩100-200M+ (~$76-150k+); senior partner / 임원 / 외국계 IB ₩200-500M+ (~$150-380k+).
- **JP**: salaryman ¥4-6M (~$28-43k); senior ¥7-10M (~$50-72k); manager ¥10-15M (~$72-108k); 役員 / executive / 専門医 senior ¥18-50M (~$130-360k); 외국계 IB associate ¥15-25M (~$108-180k).
- **US**: teacher $50-75k; office worker $55-85k; senior tech $130-200k+; doctor $200-400k; executive / partner / IB MD $300k-1M+.
- **GB**: junior office £25-45k (~$32-57k); mid-career £45-75k (~$57-95k); senior tech / consultant £80-130k (~$100-165k); senior banker / barrister / partner £100-300k+ (~$130-380k+).
- **AU**: entry-level office AU$50-75k (~$33-50k); mid-career AU$80-120k (~$55-80k); senior tech AU$140-220k (~$95-150k); executive / senior medical AU$200-400k+ (~$130-260k+).
- **CA**: mid-career CAD 60-100k (~$45-75k); senior tech CAD 130-200k (~$95-145k); executive / senior medical CAD 250-500k+ (~$180-360k+).
- **FR**: cadre moyen €40-60k (~$45-65k); senior cadre €70-130k (~$75-140k); dirigeant / IB associate / chirurgien €150-300k+ (~$160-320k+).
- **DE**: junior office €30-45k (~$32-49k); mid-career €45-70k (~$48-75k); senior €70-100k (~$75-110k); senior manager / Bereichsleiter €100-150k (~$108-165k); Geschäftsführer / leitender Arzt / partner €150-300k+ (~$160-320k+).
- **IT**: impiegato €25-40k; quadro €45-70k (~$48-75k); dirigente senior €100-200k+ (~$110-215k+).
- **NL**: junior office €30-50k (~$32-54k); mid-career €50-75k (~$54-80k); senior consultant €80-130k (~$85-140k); director / partner €150-300k+ (~$160-320k+).
- **HK**: junior office HKD 250-450k (~$32-58k); mid-career professional HKD 500-900k (~$64-115k); senior tech / banker HKD 1-2M (~$128-256k); MD / senior banker HKD 2-5M+ (~$256-640k+); senior expat HKD 1.5-3M (~$190-385k).
- **SG**: local mid-career SGD 60-100k (~$45-75k); senior tech / banker SGD 150-300k (~$110-220k); director / partner / senior medical SGD 300-700k+ (~$220-515k+); expat tech professional $80-160k.
- **AE**: junior local AED 100-200k (~$27-54k); junior expat / mid local AED 200-400k (~$54-110k); senior expat AED 400-800k (~$110-220k); executive AED 600k-1.5M+ (~$163-410k+).
- **VN**: office worker ₫120-300M (~$5-12k); senior professional ₫400-800M (~$16-32k); senior tech / banking director ₫1.5-3B (~$60-120k).
- **TH**: office worker ฿300-600k (~$8-17k); manager ฿700k-1.5M (~$20-43k); senior expat / banking ฿2-5M+ (~$57-143k+).
- **CN**: mid-career ¥80-200k (~$11-28k); senior tech / banker (Beijing/Shanghai) ¥300-700k (~$42-97k); senior management ¥800k-1.5M (~$110-210k); senior executive / partner ¥1.5M+ (~$210k+).
- **TW**: junior office NT$500k-1M (~$16-32k); senior tech / professional NT$1.5-3M (~$48-95k); middle management NT$3-5M (~$95-160k); senior banker / executive / specialist medical NT$5-10M+ (~$160-320k+).
- **IN**: junior IT ₹4-8L (~$5-10k); senior IT (Bangalore/Mumbai) ₹15-30L (~$18-36k); executive / partner / specialist medical ₹50L-1Cr+ (~$60-120k+).
- **MY**: mid-career RM 60-100k (~$13-21k); senior tech RM 150-300k (~$32-64k); executive RM 300-700k+ (~$64-148k+).
- **ID**: office worker Rp 60M-100M (~$3.7-6.2k); senior professional Rp 200-500M (~$13-31k); senior expat / executive Rp 800M-2B+ (~$50-125k+).
- **PH**: office worker ₱400k-700k (~$7-13k); mid-tier local ₱1.5-3M (~$27-54k); senior expat ₱2-5M (~$36-90k); senior executive ₱6-10M+ (~$108-180k+).
- **BR**: office worker R$40-80k (~$8-15k); senior professional R$120-300k (~$22-56k); executive / banker R$300-700k+ (~$56-130k+).
- **MX**: office worker MX$200-400k (~$10-20k); senior professional MX$700k-1.5M (~$35-75k); executive MX$1-3M+ (~$50-150k+).

Non-employed / atypical personas — DO NOT give them salary-like income:
- 대학생 / college student: part-time + 용돈, KR ₩2-10M/yr (~$1.5-7.5k); US $5-15k from part-time; JP ¥500k-2M.
- 주부 / housewife / homemaker: typically NO personal salary — represent as "household income ₩X (남편 ₩Y), 본인 가용 예산 ₩Z" or simply "남편 소득에 의존, 본인 가처분 ₩5-15M/yr".
- 은퇴자 / retiree: pension-based. KR ₩15-30M; JP ¥2-4M; US $20-40k Social Security + savings.
- 프리랜서 / 자영업자 / self-employed: wide range, note variability.
- 무직 / 구직자: minimal or none.

═══ CONSUMER BEHAVIOR ═══
Trust factors, objections, and interests should reflect that country's culture (e.g. KR: 맘카페 후기·식약처 인증; JP: 専門家推薦·品質; US: Reddit·influencer reviews; SG: government-backed health labels).

═══ VOICE FIELD (1인칭 인용) ═══
Every persona MUST include a "voice" field — a single 1-2 sentence quote in the persona's own voice, capturing how they would actually express their reaction to the product. This is what makes the persona feel like a real person, not a checklist row.

Voice rules:
- **LANGUAGE (HIGHEST PRIORITY — voice obeys Rule 1 above, not the persona's country)**: voice MUST be written in the LOCALE language declared at the bottom of the user prompt. Examples for ko locale:
  - US persona: "$25면 한 번 써볼 만해요" — NOT "$25 is worth trying" and NOT "한 번 써볼 만해요 ($25 is worth trying)".
  - **JP persona**: "Qoo10 쿠폰 뜨면 바로 살게요" or "@cosme 리뷰 20개 이상 쌓이면 살게요" — NOT "Qoo10のクーポンで安くなったら買います", NOT "@cosmeのレビューを読んでから決める", NOT "ドラッグストアで試せないのが不安だ". **JP slip is the most frequent failure** because Japanese-context references (Qoo10 / @cosme / ドラッグストア / 厚生労働省) heavily bias output toward Japanese. Reference those names by their original spelling but write the surrounding sentence in Korean. Mixed voices like "成分表 확인 못 해요" or "18에 試してみたい" are also CRITICAL ERRORS.
  - GB persona: "Cult Beauty 입점하면 살게요" — NOT "I'll buy when it lands at Cult Beauty".
  - Brand names embedded in the product description (Samsung, Blackpink, Galaxy, Coway, Qoo10) do NOT switch the output language.
  - Hangul script for ko locale; Latin script for en locale. Hiragana / katakana / non-Korean kanji in a ko-locale voice = critical error.
- **LENGTH (HARD CAP — STRICTLY ENFORCED)**: Korean ≤ 90 characters. English ≤ 130 characters. Count characters before emitting. If a draft exceeds the cap, rewrite SHORTER — drop hedges, qualifiers, second clauses. ONE sentence is the default; TWO sentences only when the second adds essential color (rare). Voices over the cap are CRITICAL ERRORS — the UI lays them out side-by-side and overlong voices break the layout.
- **English-specific tightening**: native English drafters tend to drift to 140–160 chars by adding "I'd want to..." preambles and "before I commit" tails. Cut both. Aim for 90–120 chars in English to leave headroom under 130.
- 1인칭 ("I would...", "나는…"). The persona is talking, not being described.
- Concrete: reference the actual product, price, or specific concern from objections.
- Reflects the persona's profession + price sensitivity (a pharmacist sounds different from a college student even with similar concerns).
- Mirror the locale language and the persona's cultural lens (KR: casual or polite Korean depending on age; JP: keigo for professionals if applicable, but always in OUTPUT LOCALE).
- Should NOT just summarize trustFactors/objections — instead, voice the persona's gut reaction or one specific framing they'd express.
- Compact wins: a single tight line beats a meandering 2-sentence thought.
- **CURRENCY CONSISTENCY** — when quoting a price in voice, use the persona's local currency (KR persona ⇒ ₩, US ⇒ \$, JP ⇒ ¥, TW ⇒ NT\$, EU ⇒ €). Don't convert to USD just because USD is "universal" — a Korean persona saying "\$80면 살 만해요" reads as out-of-character; "₩10만원이면 살 만해요" sounds native. Brand names and channel references stay in their canonical Latin form (preserved per the rule above).
- **VOICE DIVERSITY** — across the batch, voices must vary in tone (skeptic / neutral / champion), in sentence shape (one-liner / declarative / hedged), in concrete reference (a price / a competitor / a use-case / a value claim). Reading 12 voices in a row and finding them all rhetorically identical = critical error.
- **NO FABRICATED PRICE-RATIO CLAIMS**: do NOT write "X 반값이네요" / "X의 절반 가격" / "half of [Brand]" / "fraction of [Brand]'s price" / "1/2 the cost of [Brand]" UNLESS the math is genuinely close to that ratio. The model has no access to live competitor prices, so these claims usually misrepresent the positioning ("NT$2,700이면 Allbirds 반값" when NT$2,700 is actually 90% of Allbirds, not 50%). Quote a plain price comparison ("Allbirds 정도 가격이네요", "Allbirds보다 약간 저렴") or omit the comparison — the runtime sanitizer drops voices that match these ratio patterns, so a strong 반값-style line gets dropped silently.`;

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
  "purchaseIntent": 45,
  "voice": "맘카페 후기 좀 더 보고 한 박스만 사보려고요. 정기 구독은 가격 때문에 부담돼요."
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
  "purchaseIntent": 55,
  "voice": "의사가 추천하면 한 번 시도해보겠지만, 익숙한 일본 브랜드 두고 굳이 바꿀 이유가 있나 싶어요."
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
  "purchaseIntent": 35,
  "voice": "용돈으로 매일 사기엔 좀 세요. 그냥 쿠팡 가성비 단백질바가 낫지 않나 싶고요."
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
  "purchaseIntent": 50,
  "voice": "성분은 괜찮은데 가족이 안 먹으면 결국 제가 다 먹잖아요. 친구가 먼저 써봤다고 하면 같이 사볼게요."
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
  "purchaseIntent": 68,
  "voice": "r/Fitness에서 후기 검증되면 한 케이스 시도해볼게요. 매크로만 맞으면 프리미엄 가격은 괜찮아요."
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
  "purchaseIntent": 45,
  "voice": "I'd read a few more parenting-forum reviews first. Price is a stretch for daily use — maybe just one box to test."
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
  "purchaseIntent": 35,
  "voice": "Honestly it's pricey on my allowance — I'd rather grab a value-brand bar from Coupang."
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
  "purchaseIntent": 68,
  "voice": "If r/Fitness validates the macros, I'll try a case — premium price is fine when the spec checks out."
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
- **PARENTHETICAL SPECIALIZATION DIVERSITY (HARD RULE)**: Across the batch, NO TWO personas with the same base profession may share an identical parenthetical. This is enforced even when the obvious "default" specialization would fit both. Example failure: emitting "편집숍 바이어 (도쿄 오모테산도 멀티 브랜드 편집숍 시니어 바이어)" for every JP 편집숍 바이어 slot — the cross-sim aggregator collapses these as a single 19-clone group, which surfaces as "19 personas all live in one Tokyo neighborhood and share an exact job title", which is statistically absurd. Vary by:
   • City / district (도쿄 오모테산도 / 후쿠오카 텐진 / 오사카 신사이바시 / 나고야 사카에)
   • Sub-specialization (멀티 브랜드 / 빈티지·아카이브 / 컨템포러리 / 럭셔리 / 영캐주얼)
   • Career stage (주니어·바이어 보조 / 시니어 바이어 / 헤드 바이어 / 디렉터)
   • Age / generation cue when relevant
  At least 3 of the 4 axes above MUST differ across personas with the same base profession in this batch. If you can't think of distinct specializations, leave the parenthetical EMPTY rather than repeat — duplicates are worse than absent detail.
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
- **PRICE-AS-OBJECTION REQUIRES MATH**: before listing any price-related concern in objections, compute (product price USD ÷ persona annual income USD). If ratio < 0.2%, price is NOT a plausible objection for this persona — pick a non-price concern (channel, fit, design, brand familiarity, regulatory, category-fit) instead. If ratio is 0.2-0.5%, price is plausible only with a SPECIFIC comparator (\"Allbirds 대비 비쌈\", \"\$150 for a knit shoe\"). If ratio ≥ 0.5%, generic price concern is plausible. A \$150k earner does not rationally complain an \$87 sneaker is \"expensive\" (ratio 0.06%) — emitting that objection is a credibility failure.
- **ANCHOR REQUIREMENT**: Every trustFactor and objection MUST contain at least ONE of: real brand/product name, specific certification or regulator, named channel/retailer, price comparator with number, or specific use-case scenario. Bare adjectives without an anchor — \"편안한 착용감\", \"comfort\", \"메리노 울 부드러움\", \"디자인 좋음\", \"가격이 높음\", \"내구성 의문\", \"브랜드 인지도 낮음\" — are REJECTED at runtime regardless of locale. Write \"Allbirds 포지셔닝과 유사\" instead of \"디자인 좋음\"; \"GOTS 인증 RWS 양모\" instead of \"품질 좋음\"; \"Allbirds Tree Runner 대비 ₩30k 비쌈\" instead of \"가격이 높음\".
- **DIVERSITY QUOTA (across the batch)**: NO single concept may appear in more than 30% of personas. In a ${count}-persona batch, max ${Math.ceil(count * 0.3)} personas can mention price, max ${Math.ceil(count * 0.3)} can mention comfort, etc. If you find 5+ personas converging on a theme, REWRITE the duplicates with different anchor types — force the long tail (regulatory, niche channel, specific scene/sport, allergen, fit-for-body-type, climate, status-signal, resale, gift-context). Different personas care about different things: a 28y/o Seoul marketing manager and a 55y/o Berlin accountant should NOT flag the same blocker.

═══ adReaction — REQUIRED (2-stage funnel signal) ═══
Each persona ALSO emits an "adReaction" object: { "curiosity": 0-100, "wouldClick": true/false }. This captures the **FIRST IMPRESSION** stage — what the persona thinks SEEING THE PRODUCT AD/POST in their feed, BEFORE clicking through to the landing page or reading any details. It is a separate funnel step from purchaseIntent (which is post-consideration).
- **curiosity** (0-100): how much the ad would catch this persona's eye. 0 = scrolls past instantly. 100 = stops scrolling, reads the caption. Driven by visual, headline, and category fit with the persona's interests — NOT yet about price/specifics.
- **wouldClick**: true if curiosity is high enough that the persona would tap to learn more. Roughly: curiosity ≥ 55 → likely true; ≤ 35 → likely false; in-between is judgment.
- Funnel realism: **curiosity is typically HIGHER than purchaseIntent** for the same persona, because seeing-the-ad is a lower-friction commitment than buying. A persona with curiosity 40 and purchaseIntent 60 is suspicious — fix one of the two.
- Skeptics (low purchaseIntent) often still have moderate curiosity (e.g., 35-50) — they're curious enough to glance but not buy. That's realistic.
${referenceSection}
${example}

${languageInstruction(locale)}

Final voice self-check before emitting JSON:
1. **Language — scan every voice for forbidden script for locale "${locale}"**:
   - If locale is "ko": voice must be in Hangul (가-힣). NO hiragana (あ-ん), NO katakana (ア-ン), NO English sentences. The most frequent slip is JP-country personas slipping into Japanese for Qoo10/@cosme/ドラッグストア content — write those references in Korean ("Qoo10에서", "@cosme 리뷰").
   - If locale is "en": voice must be in Latin script.
   - If you find any violation, REWRITE that voice in the locale language before emitting.
2. **Length**: KO ≤ 90 chars · EN ≤ 130 chars (aim 90–120 for headroom). Count chars; rewrite shorter if over cap by dropping hedges ("I'd want to", "before I commit"), qualifiers, or second clauses.
Both rules are non-negotiable. Voices that violate either are CRITICAL ERRORS.

═══ TAXONOMY (HARD RULE — every objection / trust factor MUST carry a category code) ═══
The dashboard / PDF rolls up cross-country comparisons by COUNTING category codes, not by re-clustering free text. Pick the single best-fit code from the lists below per item. Emit BOTH the legacy string array (trustFactors / objections) AND the parallel categorized array (trustFactorsCategorized / objectionsCategorized) — the detail strings in categorized must equal the strings in the legacy arrays, position by position. The renderer reads either depending on context; if they disagree, the persona may be dropped.

Objection categories (pick ONE per item):
${taxonomyPromptBlock("objection", locale)}

TrustFactor categories (pick ONE per item):
${taxonomyPromptBlock("trust", locale)}

⚠ CRITICAL — DIVERSITY ACROSS THE BATCH:
- Across this batch of ${count} personas, NO single objection category may appear in more than 30% of personas (same rule for trust categories). If you find yourself stamping the same code on every other persona, STOP and re-pick: a 30y/o SG marketer's blocker is genuinely different from a 55y/o JP retiree's.
- "other" is for genuinely niche concerns. Use sparingly — high "other" rate is a signal that you're missing a fit.
- The detail string still follows the anchor requirement (concrete brand / cert / channel / scenario). The category code does NOT replace the anchor.

Return a JSON object: { "personas": [ ...${count} persona objects, each with all 12 fields including voice, adReaction { curiosity, wouldClick }, AND the parallel categorized arrays trustFactorsCategorized / objectionsCategorized ] }`;
}

export const PERSONA_REACTION_SYSTEM = `${SYSTEM_BASE}

For persona reaction generation:
- You are given pre-defined consumer personas with their profiles already established (country, age, profession, income, lifestyle).
- Your job is to predict ONLY each persona's reaction to the specific product — what they would trust, what they would object to, and how likely they are to actually buy.
- Do NOT regenerate any base profile attribute. Use the provided fields verbatim.
- Reactions must be SPECIFIC to this product (price point, category, origin, claims) and grounded in the persona's own demographic + profession + price-sensitivity context.
- trustFactors: 1-3 things ABOUT this product that this persona would find credible (specific, not generic).
  - **AVOID category-default trust signals** — "편안한 착용감" / "comfort" / "good quality" / "디자인 좋음" without an anchor are noise: every footwear sim emits "편안한 착용감" as 99% of trust factors and the actually differentiating signals (Allbirds 포지셔닝, GOTS 인증, Coupang Rocket 배송, Wirecutter 추천, color styling for indie scenes) get buried at 0%. Anchor each trust factor on a brand mention, certification, channel claim, or specific use-case scenario this persona would weigh — same depth bar as objections.
- objections: 1-3 specific concerns this persona would raise (pinpoint the friction, not platitudes).
  - **PRICE-AS-OBJECTION REQUIRES MATH** — before listing any price-related concern, run this self-check on the persona's income vs the product price:
    1. Compute USD-equivalent annual income from incomeBand (it includes a USD parenthetical for non-USD currencies).
    2. Compute the product price in USD. The base price is in the product context above.
    3. Ratio = product price ÷ annual income.
    4. Decision rules:
       - Ratio ≥ 0.5%: price-as-objection is plausible for this persona — emit it.
       - Ratio < 0.2%: price-as-objection is NOT plausible. A $87 sneaker = 0.06% of \$150k income; a $150k earner does not rationally complain that an $87 sneaker is "expensive". Drop the price objection and pick a non-price concern (channel, fit, design, brand familiarity) that actually applies.
       - Ratio in 0.2–0.5%: only emit price if you can anchor it with a SPECIFIC comparator (competitor price, recurring-purchase frame, bundle math).
  - **AVOID generic price grumbles** — "가격이 높음" / "비쌈" / "expensive" without a comparator are noise: even when the math says price IS a concern, attach an anchor — "Allbirds 대비 비쌈", "월 구독료 부담", "$150 is steep for a knit shoe" — so the cluster carries comparative signal. Bare "가격이 높음" with no comparator gets dropped by the runtime sanitizer regardless.
- purchaseIntent: 0-100 honest score reflecting actual likelihood to buy.
- voice: a single 1-2 sentence first-person quote.
  - **LANGUAGE (HIGHEST PRIORITY)**: voice MUST be in the LOCALE language regardless of the persona's country. Examples for a Korean-locale run:
    - US persona: "$25면 한 번 써볼 만해요" — NOT "$25 is worth trying".
    - **JP persona**: "Qoo10 쿠폰 뜨면 바로 살게요" — NOT "Qoo10のクーポンで安くなったら買います", NOT "@cosmeのレビューを読んでから決める". **JP slip is the most frequent failure** because Japanese-context references (Qoo10 / @cosme / ドラッグストア / 厚生労働省) heavily bias output toward Japanese. Reference those names but keep the sentence in Korean: "@cosme 리뷰 20개 이상 쌓이면 살게요" is correct.
    - GB persona: "Cult Beauty 입점하면 살게요" — NOT "I'll buy when it lands at Cult Beauty".
    - Mixed-language voices like "成分表 확인 못 해요" or "18에 試してみたい" are CRITICAL ERRORS.
    - Embedded brand names in the product description (Samsung, Blackpink, Galaxy, Coway) do NOT switch the output language.
  - **HARD LENGTH CAP — STRICTLY ENFORCED**: Korean ≤ 90 chars, English ≤ 130 chars (aim 90–120 in English for headroom). Count chars before emitting; if over cap, rewrite shorter — drop hedge phrases ("I'd want to", "before I commit"), trim second clauses. ONE sentence is the default.
  - Concrete (references the product, price, or specific concern), reflects their profession + price sensitivity, NOT a summary of trustFactors/objections. This is what makes the persona feel like a real person, not a checklist.

═══ LANGUAGE RULE (HIGHEST PRIORITY) ═══
ALL text fields (trustFactors, objections, voice) MUST be in the locale language declared at the bottom of the user prompt. The persona's "country" field controls cultural context (what reviews/influencers/channels they trust, what regulators they cite), NOT output language. Korean script only when locale is "ko"; Latin (English) only when locale is "en".

═══ BRAND / CHANNEL NAME PRESERVATION ═══
Brand names are preserved in their canonical real-world form, NOT translated:
- **kakaku.com** (価格.com) — Japan's #1 price comparison site. WRITE "kakaku.com". DO NOT translate to "가격.com" — that domain does not exist.
- **Tabelog** (食べログ) — write "Tabelog" or "타베로그", NOT "먹로그".
- **Mercari** (メルカリ), **Rakuten** (楽天) — preserve original spelling or transliterate ("메르카리", "라쿠텐"). DO NOT translate.
- Already in Latin: Qoo10, @cosme, Amazon, Costco, Wirecutter, Reddit, Sephora, Stylevana, YesStyle, Cult Beauty, Look Fantastic, John Lewis, Currys — preserve as-is.
- Government bodies and physical chains may transliterate to Hangul (厚生労働省→"후생노동성", ヤマダ電機→"야마다전기"). Rule order: preserve > transliterate > translate. Translate ONLY when an established Korean term exists.

═══ REALISM RULE ═══
Persona reactions should reflect their country's culture (e.g. KR: 맘카페·식약처; JP: 専門家推薦·品質保証; US: Reddit·인플루언서; SG: HSA labels) AND their profession-specific lens (a pharmacist verifies INCI lists differently than a college student verifies Reddit threads).

Across the batch, distribute purchaseIntent realistically — include skeptics (low), neutrals, and a few champions. Real consumer panels are heterogeneous.

═══ ANCHOR REQUIREMENT (HARD RULE — runtime drops bare adjectives) ═══
Every trustFactor and objection MUST contain at least ONE concrete anchor from this list:
  (a) A real brand/product name (Allbirds, Samsung, Coway, Le Mouton, Stio, Coupang, Sephora, Wirecutter, Reddit, Cult Beauty, John Lewis, etc.).
  (b) A specific certification or regulator (GOTS, OEKO-TEX, KFDA, CE, FDA, KC, Bluesign, B Corp, RWS, etc.).
  (c) A named channel/retailer/marketplace (Coupang Rocket, Amazon Prime, 올리브영, ZOZOTOWN, Qoo10, Selfridges, REI, etc.).
  (d) A price comparator or scenario quantifier ("Allbirds 대비 ₩30k 비쌈", "월 구독 ₩90k", "$150 vs $90 alternatives", "재구매 주기 6개월").
  (e) A specific use-case scenario ("기내용 슬립온", "겨울 출퇴근 30분", "PT 후 회복용", "웨딩 하객", "주말 등산").

BARE-ADJECTIVE OUTPUTS THAT WILL BE REJECTED — even if locale-correct:
  • "편안한 착용감", "comfort", "comfortable", "soft" (no anchor)
  • "메리노 울 부드러움", "wool softness", "fabric quality" (material adjective without scenario/cert)
  • "디자인 좋음", "stylish", "trendy", "good design"
  • "가격이 높음", "expensive", "비쌈", "pricey" (no comparator)
  • "내구성 의문", "durability concern", "long-term wear" (no test/time anchor)
  • "브랜드 인지도 낮음", "unknown brand" (no specific reference)

CORRECT FORMAT (anchor in CAPS for illustration — do NOT actually capitalize in output):
  trustFactors: ["ALLBIRDS 포지셔닝과 스타일이 비슷", "GOTS 인증 RWS 양모 사용", "WIRECUTTER 추천 통과한 모델"]
  objections: ["ALLBIRDS Tree Runner 대비 ₩30k 비쌈", "겨울 PYEONGCHANG 0°C 환경 적합성 미검증", "OLIVEYOUNG 매장 시연 불가"]

═══ DIVERSITY QUOTA (HARD RULE — across this batch of personas) ═══
NO single concept may dominate this batch. Specifically:
  1. **No phrase-level repetition**: across all trustFactor / objection arrays in this batch, no two personas may emit the same surface phrase verbatim.
  2. **No concept-level dominance**: no semantic theme (price / comfort / durability / brand-awareness / scent / size / shipping) may appear in more than 30% of personas (i.e. in a 12-persona batch, max 4 personas can mention price, max 4 can mention comfort, etc.).
  3. **Different personas care about different things**: a 28-year-old marketing manager in Seoul and a 55-year-old accountant in Berlin should NOT both flag the same blocker. Each persona's profession × age × income × interests profile should drive a different concrete concern. If you find yourself repeating, FORCE yourself into the long tail (regulatory compliance, niche channel, specific scene/sport, scent/material allergen, fit-for-body-type, season/climate, status-signal, resale value, specific influencer/community, gift-context, etc.).
  4. **Self-check before emitting**: scan your reactions array. If 5+ personas share a theme, REWRITE the duplicates with different anchor types from the list above. This rewrite is mandatory, not optional.`;

/**
 * Reaction-only prompt for pool-sampled personas. The base profile is given
 * verbatim; the LLM produces only `{ id, trustFactors, objections, purchaseIntent }`
 * per persona. Cuts ~50% of the tokens vs full persona generation since the
 * profile fields are already known.
 */
export function personaReactionPrompt(
  input: ProjectInput,
  basePersonas: Array<{
    id: string;
    ageRange: string;
    gender: string;
    country: string;
    incomeBand: string;
    profession: string;
    interests: string[];
    purchaseStyle: string;
    priceSensitivity: "low" | "medium" | "high";
  }>,
  locale: PromptLocale = "en",
  referenceBlock: string = "",
): string {
  const count = basePersonas.length;
  const personaList = basePersonas
    .map(
      (p, i) =>
        `${i + 1}. id=${p.id}
   country=${p.country} | ${p.ageRange} | ${p.gender}
   profession: ${p.profession}
   incomeBand: ${p.incomeBand}
   purchaseStyle: ${p.purchaseStyle}
   priceSensitivity: ${p.priceSensitivity}
   interests: ${p.interests.join(", ")}`,
    )
    .join("\n\n");

  const referenceSection = referenceBlock
    ? `\n${referenceBlock}\n`
    : "";

  return `Predict the reaction of EXACTLY ${count} pre-defined personas to the product below. Use each persona's base profile AS GIVEN — do not change country, age, profession, income, or any other attribute. Generate ONLY the reactions.

Product: ${input.productName}
Category: ${input.category}
Description: ${input.description}
Base price: ${(input.basePriceCents / 100).toFixed(2)} ${input.currency}
Launch objective: ${input.objective}
Origin (the company exporting this product): ${input.originatingCountry}
Candidate target markets: ${input.candidateCountries.join(", ")}
${input.competitorUrls.length > 0 ? `Competitor references: ${input.competitorUrls.join(", ")}` : ""}

Each persona is a foreign-market CONSUMER evaluating an imported ${input.originatingCountry}-origin product. Their reactions should reflect that import-buyer perspective (cultural translation distance, official-import channel concerns, price relative to local equivalents).

═══ PERSONAS (use base attributes verbatim — DO NOT regenerate) ═══

${personaList}
${referenceSection}
${languageInstruction(locale)}

For each persona above, return ONE reaction object in the SAME ORDER:
{ "id": "(the id above)",
  "trustFactors": [1-3 strings — same content as detail in trustFactorsCategorized below],
  "objections": [1-3 strings — same content as detail in objectionsCategorized below],
  "trustFactorsCategorized": [1-3 { "category": "<enum code>", "detail": "string" }],
  "objectionsCategorized":   [1-3 { "category": "<enum code>", "detail": "string" }],
  "purchaseIntent": 0-100,
  "voice": "(1-2 sentence first-person quote in the locale language)",
  "adReaction": { "curiosity": 0-100, "wouldClick": true/false } }

═══ TAXONOMY (HARD RULE — every objection / trust factor MUST carry a category code) ═══
The dashboard / PDF rolls up cross-country comparisons by COUNTING category codes, not by re-clustering free text. Pick the single best-fit code from the lists below. Every emit MUST be { category: "<one of the enum codes>", detail: "<your free-text rationale>" }. The detail string is what gets shown to the user; the category is the column-grouping signal.

Objection categories (pick ONE per item):
${taxonomyPromptBlock("objection", locale)}

TrustFactor categories (pick ONE per item):
${taxonomyPromptBlock("trust", locale)}

⚠ CRITICAL — DIVERSITY ACROSS THE BATCH:
- Across this batch of ${count} personas, NO single objection category may appear in more than 30% of personas. (Same rule for trust categories.) If you find yourself stamping "price_relative" on every other persona, STOP and re-pick: a 30-year-old SG marketer's blocker is genuinely different from a 55-year-old JP retiree's. The diversity quota is hard-enforced; categories will be re-rolled if the modal exceeds 50%.
- The "other" overflow exists for genuinely niche concerns. Use it sparingly — if you're emitting "other" more than once or twice across the batch, you're missing a fit in the proper categories.
- The detail string still follows the anchor requirement (concrete brand / cert / channel / scenario). The category code does NOT replace the anchor — it adds a comparison axis on top of the existing detail.

⚠ CRITICAL — KEEP THE TWO ARRAYS IN SYNC:
The string in trustFactors[i] MUST equal the detail in trustFactorsCategorized[i]. Same for objections. They're parallel views of the same items; the renderer reads from either depending on context. If you emit different strings in the two arrays, the persona becomes inconsistent and may be dropped at validation.

═══ adReaction — REQUIRED (2-stage funnel signal) ═══
Same semantics as in the full-persona generation prompt: adReaction is the FIRST IMPRESSION stage — seeing the ad in their feed, BEFORE clicking through to read details. Distinct from purchaseIntent (which is post-consideration).
- curiosity (0-100): how much the ad catches their eye, driven by visual / headline / category fit, not price specifics.
- wouldClick: true if curiosity is high enough to tap (roughly: ≥55 likely true, ≤35 likely false).
- **curiosity is typically HIGHER than purchaseIntent** for the same persona — seeing is a lower-friction step than buying. A persona with curiosity 40 and purchaseIntent 60 is suspicious.

Final voice self-check before emitting JSON:
1. **Language — scan every voice for forbidden script for locale "${locale}"**:
   - If locale is "ko": voice must be in Hangul. NO hiragana / katakana / English sentences. The most frequent slip is JP-country personas writing in Japanese (Qoo10/@cosme content). Write those names in Korean ("Qoo10에서", "@cosme 리뷰").
   - If locale is "en": voice must be in Latin script.
   - If you find any violation, REWRITE that voice in the locale language before emitting.
2. **Length**: KO ≤ 90 chars · EN ≤ 130 chars (aim 90–120 for headroom). Count chars; rewrite shorter if over cap.
Both rules are non-negotiable.

Return: { "reactions": [ ...${count} objects ] }`;
}

export const COUNTRY_SYSTEM = `${SYSTEM_BASE} For country scoring, weigh demand signals, competitive density, customer-acquisition cost realism, and cultural fit. Rank from best to worst.`;

export function countryPrompt(
  input: ProjectInput,
  aggregate: SimulationAggregate,
  locale: PromptLocale = "en",
): string {
  // Channel-cost grounding block — built per candidate country so the
  // LLM anchors cacEstimateUsd on real industry medians (Meta CPM,
  // Google CPC, country index) instead of free-styling. Without this
  // block CAC was just LLM intuition; with it, the LLM is asked to
  // show its work via the new cacRationale field.
  const channelCostsBlock = input.candidateCountries
    .map((country) => `[${country}]\n${buildChannelCostsBlock(country, input.category)}`)
    .join("\n\n");

  return `Rank these candidate OVERSEAS-EXPANSION TARGET MARKETS for launching the product below. The company is based in ${input.originatingCountry} (the origin / home market) and is validating overseas expansion — score each candidate as an EXPORT TARGET, not as a domestic market. The persona stats below are the bounded grounding signal — read them carefully (intent histograms, top objections, top trust signals, profession mix per country) before incorporating market structure (competition, CAC realism, regulatory friction, cultural fit, distance from origin).

CRITICAL: Only include countries from the candidate list. Do NOT add countries that are not in the list. Do NOT include the origin (${input.originatingCountry}) in the ranking — it is the home market, not a target.

Origin (home market, NOT a target): ${input.originatingCountry}
Product: ${input.productName} (${input.category})
Description: ${input.description}
Base price: ${(input.basePriceCents / 100).toFixed(2)} ${input.currency}
Objective: ${input.objective}
Candidate target markets (ONLY these allowed): ${input.candidateCountries.join(", ")}

${renderAggregateForPrompt(aggregate, locale)}

═══ CAC GROUNDING — CHANNEL COSTS PER CANDIDATE COUNTRY ═══
Use these medians as the basis for cacEstimateUsd. Do NOT free-style a number — start from the channel mix you'd realistically run for this category and arithmetic from there.

${channelCostsBlock}

CAC formula:
  base_CAC = blended_CPM_or_CPC × your_assumed_channel_mix / (CTR × CVR)
  cacEstimateUsd = base_CAC × NEW_BRAND_MULTIPLIER

The CTR/CVR medians above are already CALIBRATED for cold paid traffic — do NOT additionally divide by an "intent" factor or substitute persona-derived buy rates. Persona purchaseIntent is stated intent against a curated audience, not a click-through-buy rate of an ad-served cold audience; combining the two double-discounts.

═══ NEW-BRAND ENTRY MULTIPLIER (mandatory) ═══
This product is launching as an UNKNOWN export brand from ${input.originatingCountry} in each candidate market. There is no organic search demand, no review depth, no peer-of-peer trust. Apply a brand-awareness multiplier to base_CAC reflecting:
  - Cold-cold audience (no recognition) requires retargeting + frequency loops to convert. First-90-day blended CAC runs 1.3-2.0× the channel-cost arithmetic.
  - Bottom-funnel marketplace channels (Amazon, Coupang, Shopee, Rakuten, Tmall) get a SMALLER multiplier (1.2-1.5×) because intent is captured at the search stage, but new-brand still loses to category-leaders on the SERP.

Multiplier guidance (pick one, document in cacRationale):
  · 1.3-1.5× — cultural-halo categories with pre-existing tailwind (K-beauty into JP/SE Asia, K-snack into US, K-fashion in TW).
  · 1.5-1.8× — typical cross-border DTC (most cases). Default unless you have a specific reason to deviate.
  · 1.8-2.0× — premium / luxury positioning where trust signals are critical, OR low-context buyer cultures (US, UK, DE) where unfamiliar brand = friction.

For each country, emit cacRationale (string) showing your work — REQUIRED format:
  "Mix: 60% Meta @ CPM $X + 30% Google Search @ CPC $Y + 10% [local channel]. Channel arithmetic: base CAC ≈ $A. New-brand multiplier 1.6× (typical cross-border DTC). Final CAC ≈ $B."
This appears in the report so the user can audit. Without an explicit multiplier line, the rationale fails review.

${languageInstruction(locale)}

Return a JSON object: { "countries": [ { country, demandScore, cacEstimateUsd, cacRationale, competitionScore, finalScore, rank, rationale, components } ] } — sorted by rank ascending (1 = best). country must be one of: ${input.candidateCountries.join(", ")}.

═══ SCORE SCALE (CRITICAL — common mistake) ═══
ALL scores (demandScore, competitionScore, finalScore, and every components.* value) are on a **0-100 scale**, NOT 0-10.
- A strong recommendation: finalScore 75-85 (NOT 7.5-8.5)
- A weak market: finalScore 30-50 (NOT 3-5)
- An average market: finalScore 55-70 (NOT 5.5-7)
- cacEstimateUsd is a dollar amount (e.g. 12.50 means $12.50), NOT a score.
If your top-ranked country has finalScore < 50, double-check — you probably accidentally used the 0-10 scale. Multiply by 10 to fix before emitting.

═══ components — REQUIRED — 6 sub-scores 0-100 ═══
For every country, also emit a "components" object decomposing the finalScore into six dimensions. The user reads these to understand *why* a country ranks where it does — generic "looks good" rationales aren't enough. Score each independently against the candidate market context, NOT relative to the other countries in the list:
  - marketSize: addressable market scale (population × purchasing power × category penetration). Higher = larger reachable market.
  - culturalFit: language alignment, brand familiarity, lifestyle/values match for this product. Higher = lower cultural translation cost.
  - channelMatch: availability of distribution channels this product needs (e.g., relevant ecommerce platforms, retail format, cross-border logistics) AND alignment with persona channel preferences. Higher = easier to reach buyers.
  - priceCompat: price tolerance vs local purchasing power, competitor price anchors, and persona priceSensitivity. Higher = price point lands well.
  - competition: INVERTED — higher means LESS crowded / less dominant local incumbent. (Don't confuse with the top-level competitionScore which uses the same convention.)
  - regulatory: INVERTED — higher means FEWER import duties / certifications / restrictions / FX or tax frictions. A blocker like food-safety registration or wholly-prohibited category should pull this below 30.

finalScore should be a sensible weighted-average reflection of the components, but you can incorporate cross-component interaction (e.g., great marketSize but regulatory < 25 should drag finalScore down sharply — a launch-blocker isn't averaged away). Don't blindly arithmetic-mean the six.`;
}

export const PRICING_SYSTEM = `${SYSTEM_BASE} For pricing, model how conversion changes across price points — typically conversion drops as price rises, but not linearly. Identify the revenue-maximizing point.`;

export interface PricingRangeContext {
  minCents: number;
  maxCents: number;
  rationale: string[];
}

export interface CompetitorPriceContext {
  url: string;
  priceCents: number;
  productName?: string;
}

export function pricingPrompt(
  input: ProjectInput,
  aggregate: SimulationAggregate,
  locale: PromptLocale = "en",
  range?: PricingRangeContext,
  competitorPrices?: CompetitorPriceContext[],
  marginGroundingBlock?: string,
): string {
  // Range defaults to 0.5x-2.0x of base if not provided (legacy callers).
  const minCents = range?.minCents ?? Math.round(input.basePriceCents * 0.5);
  const maxCents = range?.maxCents ?? Math.round(input.basePriceCents * 2.0);
  const rangeReason = range?.rationale.join("; ") ?? "";

  // Competitor pricing context — string block for the prompt. Only
  // included when at least one URL extraction succeeded.
  const competitorBlock =
    competitorPrices && competitorPrices.length > 0
      ? `

═══ COMPETITOR RETAIL PRICES (extracted from user-provided URLs) ═══
Real retail prices from competitors. The recommended price should be informed by where these land — pricing significantly above the highest competitor needs justification (premium positioning), and below the lowest needs justification (entry-tier positioning):

${competitorPrices
  .map(
    (c) =>
      `  ${(c.priceCents / 100).toFixed(2)} ${input.currency}${c.productName ? ` — ${c.productName}` : ""} (${c.url})`,
  )
  .join("\n")}

Use these as anchors. The pricing curve should COVER this competitive band, and recommended price should reference whether the product is positioned above / within / below the competitive set.`
      : "";

  return `Generate a pricing curve for this product. Sample 7-10 price points across the range ${(minCents / 100).toFixed(2)} ${input.currency} to ${(maxCents / 100).toFixed(2)} ${input.currency}. For each point, estimate conversion probability (0-1) and a revenue index (price * conversion, normalized).
${rangeReason ? `Range rationale: ${rangeReason}` : ""}

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
${competitorBlock}

${languageInstruction(locale)}

═══ CURRENCY LOCK — non-negotiable ═══
ALL price values you emit (recommendedPriceCents AND every curve.priceCents)
MUST be in **${input.currency} cents** — i.e., the integer value × 100 in
${input.currency}, the project's input currency. This is true even if you
recommend a country whose local currency is different (e.g., recommending
TW for a KRW-input project: emit prices as KRW cents, NOT TWD).
DO NOT silently convert to a different currency. If recommendedPriceCents
ends up < 30% or > 500% of the base price (${(input.basePriceCents / 100).toFixed(2)} ${input.currency}),
you are almost certainly emitting the wrong scale — recompute.

═══ recommendedPriceCents — DO NOT ANCHOR ON BASE PRICE ═══
The base price (${(input.basePriceCents / 100).toFixed(2)} ${input.currency}) is INPUT context, not a default answer. Many models default to "recommended = base" without doing the math — that's a critical error.

Required behaviour:
1. Compute revenue index = priceCents × conversionProbability for EVERY curve point.
2. Pick the price point with the **highest revenue index** as the recommended price.
3. The recommended price MUST equal one of the priceCents values you emit in the curve (or be within ±2% of it). It must NOT default to base unless base genuinely is the curve's revenue maximum.
4. If the persona price-sensitivity profile suggests demand is highly inelastic (mostly "low"), the revenue max is likely ABOVE base. If demand is highly elastic ("high"), it's likely BELOW base. Only rare cases land exactly at base.${competitorPrices && competitorPrices.length > 0 ? `\n5. Use competitor prices above as a reality check — if your recommended is wildly off (e.g., 2x+ above max competitor for non-luxury, or ½ below min competitor for non-budget), reconsider.` : ""}

A consistency check the runner will apply post-emission: if your recommendedPriceCents differs from the argmax(priceCents × conversionProbability) of your own curve by more than 10%, the result will be flagged as "LLM anchored on base price" — readers will see this discrepancy in the report.

═══ marginEstimatePct — REQUIRED, integer percentage ═══
Emit \`marginEstimatePct\` as a single integer (0-95) representing the **typical gross margin %** for this category in the recommended country. Calibration anchors:
- Premium DTC food/beverage (specialty olive oil, craft sauces, supplements): ~40-55
- Mass-market CPG (grocery snacks, packaged goods): ~20-35
- Branded SaaS / digital: ~70-85
- Hardware / consumer electronics: ~25-40
- Luxury / artisan (handmade, single-origin): ~50-65
Use the most realistic mid-point for THIS product's category × distribution model (DTC vs wholesale shifts margin meaningfully). The dashboard uses this to compute break-even at this margin and at ±10pp around it — pessimistic / base / optimistic — so the user sees viability sensitivity instead of a single hardcoded assumption.
${marginGroundingBlock ? `\n${marginGroundingBlock}\n\n⚠ The grounding block above is fresher / more specific than the calibration anchors. PREFER its numbers when they apply to this product's exact category × country. The marginEstimate prose MUST cite at least one source ([1] / [2] / etc.) so the user can trace the figure, AND populate the marginEstimateSources field with the cited entries.\n` : ""}
Return: { "recommendedPriceCents": int, "marginEstimate": "string description (in ${LANG_NAME[locale]})", "marginEstimatePct": int (0-95), "curve": [ { priceCents, conversionProbability, estimatedRevenueIndex } ]${marginGroundingBlock ? `, "marginEstimateSources": [ { "title": "source title from the grounding block", "url": "matching URL" } ]` : ""} }`;
}

export const MARKET_PROFILE_SYSTEM = `${SYSTEM_BASE}

You are a market entry analyst preparing a deep-dive on a SINGLE recommended target country for a launching brand. Your job: deliver structured market intelligence the founder can use to plan the launch — named competitors, real channel landscape, regulatory specifics, pricing benchmarks. Concrete > abstract. Named brands > "competitive landscape".

Realism rules:
- Only name competitors and channels you have reasonable confidence about. If you don't know specific players in a niche category, say so via empty arrays — never fabricate brand names.
- Pricing benchmarks should reflect ACTUAL retail in the target country (use local currency conversions; if uncertain, use a wider range like "$60-100" instead of fake precision).
- Regulatory items should reference real bodies (FDA, KFDA, MHLW, HSA, DGFT etc.) or be omitted.
- Cultural notes should be specific to the country, not generic platitudes.
- Differentiators must reference competitors or category specifics — not abstract claims.`;

export function marketProfilePrompt(
  input: ProjectInput,
  recommendedCountry: string,
  context: {
    consensusPercent: number;
    countryFinalScore: number;
    topObjections: string[];
    topTrustFactors: string[];
    topChannels: string[];
    /**
     * Pricing-stage recommended price (in cents) — when present, the
     * LLM anchors `yourPosition` on this instead of the user's input
     * base price so the narrative is consistent with the Pricing tab's
     * headline. Null means pricing stage produced no recommendation
     * (fallback to input price).
     */
    recommendedPriceCents: number | null;
    /**
     * Pre-computed string showing the launch price in BOTH the input
     * currency and the recommended target market's local currency
     * (e.g. "₩192,900 (≈ S$193)"). Computed server-side from the FX
     * snapshot in competitor-prices.ts so the LLM doesn't have to do
     * its own conversion math — it produced inconsistent values
     * within a sentence ("≈ SGD 193 환산 기준 약 SGD 145–150") when
     * left to convert. Null when the FX snapshot doesn't cover the
     * input or target currency. Caller falls back to old behaviour
     * (LLM expresses price in input currency only).
     */
    launchPriceLocalText?: string | null;
    locale: PromptLocale;
    /**
     * Tavily web-search results for the marketSize stage. When non-empty,
     * the LLM is required to anchor its TAM / growth / addressable
     * numbers on these snippets — much harder to hallucinate when
     * concrete figures + URLs are sitting right there. Empty array means
     * Tavily was unavailable (no API key, network error) and the LLM
     * falls back to its training data.
     */
    marketSnippets?: Array<{
      url: string;
      title: string;
      content: string;
      score: number;
    }>;
  },
): string {
  const isKo = context.locale === "ko";
  const objectionsBlock = context.topObjections.length
    ? context.topObjections.slice(0, 5).map((o) => `  - ${o}`).join("\n")
    : "  (none surfaced)";
  const trustBlock = context.topTrustFactors.length
    ? context.topTrustFactors.slice(0, 5).map((t) => `  - ${t}`).join("\n")
    : "  (none surfaced)";
  const channelsBlock = context.topChannels.length
    ? context.topChannels.slice(0, 8).join(", ")
    : "(none surfaced)";
  // Pre-format the Tavily snippets block so the prompt body stays
  // readable. Trim each snippet to ~400 chars — full content can run
  // 1.5K+ and we have ~5 snippets, which inflates the prompt without
  // adding signal beyond the first sentence or two.
  const snippets = context.marketSnippets ?? [];
  const marketSnippetsBlock =
    snippets.length === 0
      ? ""
      : `

═══ MARKET-SIZE WEB SEARCH (use these for the marketSize fields) ═══
The following snippets came from a Tavily web search for "${input.category} market size ${recommendedCountry}". They are real, sourced numbers — anchor the marketSize.estimateUsd / growthTrend / addressableSegment ON THESE rather than your training data. If a snippet contradicts your prior, trust the snippet.

${snippets
  .slice(0, 5)
  .map(
    (s, i) =>
      `[${i + 1}] ${s.title}
URL: ${s.url}
${s.content.slice(0, 400)}${s.content.length > 400 ? "..." : ""}`,
  )
  .join("\n\n")}

When emitting marketSize.estimateUsd, prefer specific figures ("$3.5–5B annually") over vague ranges, and pick numbers that the snippets above actually support. If the snippets are weak / off-topic for this category × country, fall back to a conservative estimate and flag it as such.
`;

  return `Produce a structured market profile for the RECOMMENDED launch country. Be specific. Reference real brands, channels, and regulators where you have confidence; omit (empty array / blank string) where you don't.

Product: ${input.productName} (${input.category})
Description: ${input.description}
User-input base price: ${(input.basePriceCents / 100).toFixed(2)} ${input.currency}${
  context.recommendedPriceCents != null
    ? `
Pricing-stage recommended launch price: ${(context.recommendedPriceCents / 100).toFixed(2)} ${input.currency}
↑ USE THIS AS THE LAUNCH PRICE throughout differentiators, risks, and yourPosition. The user's input price is a starting reference; the persona conversion data converged on the recommended price as revenue-optimal. If you cite a price in any field (e.g. "at $X retail with ~50% COGS"), use the recommended price, not the input price. When the recommended price differs materially from the input (>15%), explicitly call out the gap so the founder sees it.`
    : ""
}
Origin (home market): ${input.originatingCountry}
RECOMMENDED COUNTRY: ${recommendedCountry}
Consensus support: ${context.consensusPercent}% of sims · final score ${context.countryFinalScore.toFixed(1)}/100

Persona signal (already aggregated from sims) — use as grounding, not output:
  Top objections in ${recommendedCountry}:
${objectionsBlock}
  Top trust factors in ${recommendedCountry}:
${trustBlock}
  Channels personas already mention: ${channelsBlock}
${marketSnippetsBlock}
${languageInstruction(context.locale)}

Required JSON shape (every field optional — fill what you have confidence about, leave the rest empty/blank):
{
  "country": "${recommendedCountry}",
  "marketSize": {
    "estimateUsd": "SHORT TAM figure ONLY — '$2.3B annually' or '$400-600M (premium segment)'. Max 60 chars. Do NOT inline source citations or methodology prose; the system attaches source URLs separately, and growthTrend / addressableSegment are for context. A pure figure-with-light-qualifier is what this field is for.",
    "growthTrend": "growth rate + 1-line driver, e.g. '+12% YoY, Gen-Z sustainability demand'. Max 100 chars.",
    "addressableSegment": "the realistic addressable share — e.g. 'premium eco-conscious 25-44, ~5% of total'. Max 120 chars."
  },
  "competitors": [
    // 3-5 NAMED competitors. Mix of direct (same category), indirect (substitute), and adjacent.
    // type: direct | indirect | substitute
    // threatLevel: high | medium | low
    {
      "name": "actual brand name (e.g. Allbirds, Veja, Cariuma)",
      "type": "direct",
      "originCountry": "ISO-2 code preferred — 'US', 'FR', 'BR', 'NZ'. Required when known; empty string if you genuinely don't know the brand origin (don't guess).",
      "brandContext": "ONE sentence in the locale language with the 'who are they?' answer: founding year + scale + cultural standing. Examples — 'Founded 2016 in San Francisco, B Corp certified, ~$300M global revenue (2023 estimate)' / '2018년 파리 창업, 윤리적 친환경 포지셔닝으로 LVMH 산하 입점, 글로벌 매출 €100M 미만 추정'. Required when name is named; if you genuinely don't know the brand's history, leave empty rather than fabricate. Max 140 chars.",
      "strengths": ["1-3 specific things — established Reddit reputation, retail at REI, B Corp cert"],
      "weaknesses": ["1-3 specific things — pricier than alternatives, narrow size range"],
      "pricePoint": "actual price in local currency or USD — '$95-115/pair'",
      "marketShareEstimate": "category-leader / mid / niche, with ~% if known",
      "threatLevel": "high"
    }
  ],
  "channels": {
    "primary": [
      // 2-3 channels where this product MUST appear to launch — e.g. Amazon, REI, Whole Foods.
      { "name": "channel name", "rationale": "1 sentence why" }
    ],
    "secondary": [
      // 2-3 channels worth pursuing in phase 2 — TikTok Shop, niche retailers
      { "name": "...", "rationale": "..." }
    ],
    "emerging": [
      // 1-2 newer channels with growth — e.g. Shopify-direct, Substack newsletters, etc.
      { "name": "...", "rationale": "..." }
    ]
  },
  "culturalNotes": {
    "valuesAlignment": "1-2 sentences on what this country's premium consumers value — research-driven? trend-driven? brand-loyal? sustainability-focused?",
    "purchaseBehavior": "1-2 sentences on how buyers research + decide for this category — Reddit-first? Influencer-led? Retail-touch-then-buy-online?",
    "languageNotes": "any brand naming / packaging language considerations specific to this market",
    "seasonality": "Q4 spike? Q2 lull? Pre-holiday demand? Specific to this category in this country"
  },
  "regulatory": {
    "barriers": [
      // up to 5 real barriers
      { "name": "barrier name (e.g. FDA cosmetic registration)", "severity": "high|medium|low", "description": "what it requires" }
    ],
    "requirements": ["specific docs / labels / certs required to sell"],
    "timeToCompliance": "realistic timeline — '3-6 months for primary cert + 6 weeks for labelling'"
  },
  "pricingBenchmarks": {
    "entryLevel": "${input.currency} range for budget products in this category in ${recommendedCountry}",
    "mid": "${input.currency} range for mid-tier",
    "premium": "${input.currency} range for premium",
    "yourPosition": "${context.recommendedPriceCents != null
      ? `Where the recommended launch price${context.launchPriceLocalText ? ` ${context.launchPriceLocalText}` : ` $${(context.recommendedPriceCents / 100).toFixed(2)} ${input.currency}`} lands in this market — reference 1-2 named competitors above and explain what justifies the position.${context.launchPriceLocalText ? ` ⚠ HARD RULE: when citing the launch price, USE THE PRE-COMPUTED STRING "${context.launchPriceLocalText}" VERBATIM. Do NOT do your own currency conversion — the server already converted it, and your inline math has produced inconsistent values within a single sentence in past runs. If you need to compare against competitor prices in another currency, compare qualitatively (above / below / at par) instead of inline-converting.` : ""} The user's input base price is $${(input.basePriceCents / 100).toFixed(2)} ${input.currency}; if the recommended price differs materially (>15%), call out the gap and what proof points / messaging the higher (or lower) anchor requires. Example: '${context.launchPriceLocalText ?? "$49.95 (vs. your input $32)"} — upper-premium, just above Brightland anchor; only justified if polyphenol numbers + harvest date are front-and-center.'`
      : `Where ${input.basePriceCents / 100} ${input.currency} lands in this market — 'upper-mid range, just below Allbirds anchor'`}",
    "yourPositionPriceCents": ${context.recommendedPriceCents != null ? context.recommendedPriceCents : input.basePriceCents}
  },
  "goToMarketStrategy": {
    "keyMessage": "1-2 sentence positioning that beats current incumbents — be specific about the wedge",
    "primaryAudience": "ICP description — age + lifestyle/values + buying triggers + where they hang out (online channels, retailers, social platforms). ⚠ STAY IN THE PRODUCT'S CATEGORY. The interests / activities you cite must plausibly include this product as a daily-use item — not as a niche-substitute. Bad example for a casual merino-wool sneaker: '트라이애슬론 회복화 관심층' (triathlon recovery shoes are a different category — Oofos / Hoka Restore — not a casual sneaker). Good example: '주 3회 이상 도보·대중교통 출퇴근, 주말에는 카페·갤러리 산책을 즐기는 도시 직장인'. If you find yourself reaching into a competing-product superuser niche to justify the audience, scope back to lifestyle / values / shopping habits that the actual product fits.",
    "differentiators": ["2-4 differentiators vs the named competitors above — concrete, defensible"],
    "differentiatorsCategorized": [{ "category": "<one of the differentiator taxonomy enum codes below>", "detail": "(same string as the corresponding differentiators entry above)" }],
    "risks": ["2-3 specific market-entry risks — not generic 'competitive risk' but concrete pitfalls"],
    "risksCategorized": [{ "category": "<one of the risk taxonomy enum codes below>", "detail": "(same string as the corresponding risks entry above)" }]
  }
}

═══ DIFFERENTIATOR TAXONOMY (every entry in differentiators MUST carry a category code) ═══
${taxonomyPromptBlock("differentiator", isKo ? "ko" : "en")}

═══ RISK TAXONOMY (every entry in goToMarketStrategy.risks MUST carry a category code) ═══
${taxonomyPromptBlock("risk", isKo ? "ko" : "en")}

⚠ The detail string in *Categorized[i] MUST equal the string in the parallel free-text array at position i. Renderer reads either depending on context; mismatched arrays may drop the entry at validation.

Final reminder: ${isKo ? "모든 텍스트 필드는 한국어로 작성. 브랜드명·채널명·규제 명칭은 원문 그대로 (Allbirds, Amazon, FDA 등)." : "Write all text fields in English. Brand / channel / regulator names stay in their canonical form."} If you have low confidence on a section (especially competitors or pricing benchmarks), it's better to leave it sparse than to fabricate. Empty arrays / blank strings render cleanly.

${isKo ? `═══ 영문 마케팅 약어 표기 규칙 (한국어 출력 시 필수) ═══
한국어 출력에서 영문 마케팅 약어 (USP, ICP, KPI, GTM, MOQ, ROI, LTV, CAC, ARPU, AOV, SKU, MVP, B2B, B2C, DTC, COGS, AB 테스트 등) 를 사용할 때, **첫 등장 시 반드시 풀 영문 + 한국어 설명을 괄호로 병기**하세요. 두 번째 등장부터는 약어만 써도 됩니다. 형식: \`약어 (Full English Form · 한국어 설명)\`.
예시:
  ✓ "USP (Unique Selling Proposition · 핵심 차별점) 로 ..." (첫 등장)
  ✓ "이 USP 가 ..." (두 번째 이후)
  ✗ "핵심 USP 로 ..." (첫 등장인데 풀 폼 없음 — 사용자가 약어를 모르면 막힘)
  ✓ "ICP (Ideal Customer Profile · 이상적 고객 프로필) 는 25-38세 도시 직장인"
  ✓ "GTM (Go-to-Market · 시장 진입) 전략은 ..."
  ✓ "CAC (Customer Acquisition Cost · 고객 획득 비용) 는 ..."
  ✓ "MOQ (Minimum Order Quantity · 최소 주문 수량) 1,000개 ..."
이 규칙은 한국어 페이지를 읽는 비-마케팅 founder 도 약어 막힘 없이 읽을 수 있게 하기 위함. 마케팅 백그라운드 가정 금지.` : ""}`;
}

export const SYNTHESIS_SYSTEM = `${SYSTEM_BASE} For final synthesis, distill the analysis into an executive-readable verdict with a clear go/no-go signal, the highest-leverage action plan, and honest risks.`;

export const SYNTHESIS_CRITIQUE_SYSTEM = `${SYSTEM_BASE}

You are a consistency auditor for executive simulation reports. Given a synthesis result and the underlying data (country scores, pricing curve, risks, persona aggregate), check that the headline claims hold up. Return mechanical fixes for any inconsistency, in the SAME locale as the synthesis output.

Bias toward "no issue": only flag when there's a clear data contradiction. Style/voice differences ARE NOT issues — the author has latitude. Only structural mismatches matter:
- bestCountry that isn't actually the highest-ranked candidate (off by >5 points or rank > 1)
- riskLevel "low" when 3+ HIGH risks are listed (or "high" when no risks above MEDIUM exist)
- bestPriceCents that's nowhere on the recommended pricing curve
- bestSegment claiming a profession/age that's < 5% of the persona pool
- headline that contradicts the bestCountry / riskLevel decisions

When in doubt, leave \`fixes\` empty.`;

/**
 * Self-critique pass — runs after synthesis to catch inconsistencies between
 * the executive-summary claims and the underlying persona/country/pricing
 * data. Returns mechanical fixes the runner applies before persisting.
 */
export function synthesisCritiquePrompt(
  input: ProjectInput,
  countriesJson: string,
  pricingJson: string,
  synthesisJson: string,
  locale: PromptLocale = "en",
): string {
  return `Audit this synthesis result for internal consistency with the underlying data.

Origin: ${input.originatingCountry}
Candidate target markets: ${input.candidateCountries.join(", ")}
Country scores (data): ${countriesJson}
Pricing analysis (data): ${pricingJson}

Synthesis result (under audit):
${synthesisJson}

═══ Consistency checks ═══

1. **bestCountry alignment**: Is overview.bestCountry the highest-ranked entry in the country scores (rank=1)? If not, fix overview.bestCountry to the actual rank-1 country code.

2. **riskLevel calibration**: Count the risks by severity. Roughly:
   - 0-1 HIGH + 0-1 MEDIUM = "low"
   - 1-2 HIGH or 2-4 MEDIUM = "medium"
   - 3+ HIGH or many MEDIUM = "high"
   If overview.riskLevel is off by one bucket, fix it.

3. **bestPriceCents alignment**: Is overview.bestPriceCents within ±15% of pricing.recommendedPriceCents? If not, set it to pricing.recommendedPriceCents.

4. **headline consistency**: If you fix bestCountry or riskLevel above, also rewrite headline (in ${LANG_NAME[locale]}) to match. Otherwise leave it.

5. **bestSegment plausibility**: We don't have the persona pool here, so trust the synthesis on this one unless overview.bestSegment is empty/generic ("everyone", "general consumer"). Only override if obviously broken.

═══ Output rules ═══

- If everything checks out: \`{ "issues": [], "fixes": {} }\`
- If issues found: list them in \`issues\` (1 line each, in ${LANG_NAME[locale]}) and put corrections in \`fixes\`. Only include fields that need fixing — DO NOT echo unchanged fields.
- Be conservative: flagging a non-issue is worse than missing one.

${languageInstruction(locale)}

Return: { "issues": [...], "fixes": { bestCountry?, riskLevel?, bestPriceCents?, bestSegment?, headline? } }`;
}

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

  // ── Creative section ──────────────────────────────────────────
  // Concept descriptions feed in as text (always). Image URLs are passed
  // separately as image content blocks by the LLM provider — the prompt
  // tells the model HOW to use them. When neither is provided, instruct
  // the model to skip creative and emit an empty array.
  const hasDescriptions = (input.assetDescriptions?.length ?? 0) > 0;
  const hasImages = (input.assetUrls?.length ?? 0) > 0;
  const creativeSection = (() => {
    if (!hasDescriptions && !hasImages) {
      return locale === "ko"
        ? `\n크리에이티브 자산이 제공되지 않았습니다. "creative" 필드는 빈 배열 []로 두세요.`
        : `\nNo creative assets provided. Leave the "creative" field as an empty array [].`;
    }
    const lines: string[] = [];
    if (hasDescriptions) {
      lines.push(
        locale === "ko"
          ? `크리에이티브 컨셉 (텍스트 설명):`
          : `Creative concepts (text descriptions):`,
      );
      input.assetDescriptions.forEach((d, i) => lines.push(`  ${i + 1}. ${d}`));
    }
    if (hasImages) {
      lines.push(
        locale === "ko"
          ? `\n첨부된 이미지 ${input.assetUrls.length}장이 이 메시지의 시각 자료로 함께 전달되었습니다 (위 텍스트 다음 순서). 각 이미지를 실제 시각 자료로 검토하고, 텍스트 컨셉과 매칭하여 평가하세요.`
          : `\n${input.assetUrls.length} image(s) are attached as visual references in this message (after the prompt text). Inspect each image as actual visuals and pair them with the text concepts above for scoring.`,
      );
    } else if (hasDescriptions) {
      lines.push(
        locale === "ko"
          ? `\n이미지 URL은 제공되지 않았습니다 — 텍스트 설명만으로 제품 컨텍스트·페르소나 신호 기반 평가를 진행하세요. 정확도는 시각 자료가 있을 때보다 낮을 수 있다는 점을 인지하세요.`
          : `\nNo image URLs provided — score based on the text descriptions and product context only. Note that accuracy is lower without visual references.`,
      );
    }
    lines.push(
      locale === "ko"
        ? `\n결과의 "creative" 필드에 각 컨셉/이미지마다 한 항목씩 채우세요: { "assetName": "(canonical 영문 라벨)", "score": 0-100, "strengths": [...], "weaknesses": [...] }.\n\n⚠ **assetName 규칙 (필수)**:\n  - 영문 표기 우선 (제품명·flavor·브랜드명은 원문 영문 그대로 — 예: "Cherry Cola", "Peachy Plum", "Polyphenol Lab"). 제품에 한국어 이름만 있으면 한국어 그대로.\n  - **3단어 이내**, 제품/컨셉의 핵심 명사만. 예: "Cherry Cola" (○) / "Cherry Cola — 레드·블랙 담배 연상 컬러" (✗).\n  - 색상·스타일·구도 같은 시각 modifier는 strengths/weaknesses에서 다루고 assetName에는 넣지 마세요.\n  - **같은 컨셉은 모든 시뮬에서 동일 assetName으로 emit** — 다른 단어·번역·띄어쓰기 사용 시 dedup이 깨져 같은 컨셉이 N번 중복 표시됩니다.\nstrengths/weaknesses는 페르소나의 신뢰 요인·거부 요인을 근거로 ${LANG_NAME[locale]}로 작성. "overview.bestCreative"는 점수가 가장 높은 항목의 assetName과 일치시키세요.`
        : `\nFill the result's "creative" field with one entry per concept/image: { "assetName": "(canonical English label)", "score": 0-100, "strengths": [...], "weaknesses": [...] }.\n\n⚠ **assetName rules (required)**:\n  - Prefer English (product name / flavor / brand stays in its native form — e.g. "Cherry Cola", "Peachy Plum", "Polyphenol Lab"). Korean only when there is no English equivalent.\n  - **Max 3 words**, only the core noun of the concept. Good: "Cherry Cola". Bad: "Cherry Cola — red-black cigarette-evocative color".\n  - Visual modifiers (color, style, composition) belong in strengths/weaknesses, NOT in assetName.\n  - **Use the SAME assetName across every sim for the same concept** — different wording / translation / spacing breaks dedup and the dashboard shows the same concept N times.\nGround strengths/weaknesses in the persona trust factors and objections, written in ${LANG_NAME[locale]}. Set "overview.bestCreative" to the assetName of the highest-scoring entry.`,
    );
    return lines.join("\n");
  })();

  return `Produce the final executive verdict for this OVERSEAS-EXPANSION launch simulation. The company is based in ${input.originatingCountry} (origin / home market) and is validating expansion into the candidate overseas markets below. Treat the analysis strictly as an export-validation report — DO NOT recommend launching in ${input.originatingCountry} as if it were a target market, and do not include domestic-channel action items (e.g. ${input.originatingCountry === "KR" ? "스마트스토어·네이버 쇼핑·KR-internal channels" : "home-market-only retail or distribution"}). The bestCountry field MUST be one of the candidate overseas targets, never the origin.

${dateContext}

Origin (home market, NOT a target): ${input.originatingCountry}
Product: ${input.productName} (${input.category}) — ${input.description}
Base price: ${(input.basePriceCents / 100).toFixed(2)} ${input.currency}
Objective: ${input.objective}
Country scores (JSON): ${countriesJson}
Pricing analysis (JSON): ${pricingJson}

${renderAggregateForPrompt(aggregate, locale)}

═══ CREATIVE EVALUATION ═══${creativeSection}

${languageInstruction(locale)}

═══ RISK WRITING GUIDANCE ═══
${
  locale === "ko"
    ? `리스크는 "규제 리스크" / "경쟁 강도" 같은 추상적 카테고리가 아니라, 구체적이고 의사결정에 직접 쓸 수 있는 형태로 작성하세요.

각 리스크는 다음을 포함해야 합니다:
1) **구체적 원인**: 어느 페르소나 거부 요인, 국가 규제, 가격 민감도 신호에서 도출됐는지 명시.
2) **사업적 임팩트**: 가능하면 정량화 (예: "진입 첫 90일 매출 ${"±"}40% 변동", "광고 비용 1.5배 상승", "런칭 ${"±"}3개월 지연").
3) **적용 진출국**: 어느 시장에 가장 강하게 적용되는지 (예: "US 한정", "JP·GB 공통").

5-8개의 구별되는 리스크를 작성하세요. 같은 원인의 변형은 합쳐서 하나로 표현. severity는 발생 확률 + 임팩트 크기로 판단.

나쁜 예: { "factor": "규제 리스크", "severity": "medium", "description": "현지 규제를 준수해야 함." }
좋은 예: { "factor": "Amazon US 미입점 — Stylevana/YesStyle 의존", "severity": "high", "description": "US 페르소나 67명 중 42명이 Amazon US를 1순위 구매처로 언급. 직접 입점 없이 Stylevana로만 판매 시 진입 첫 90일 잠재 매출의 ${"±"}55%를 잃을 수 있음." }`
    : `Write risks as concrete, decision-actionable items — never abstract categories like "regulatory risk" or "competition intensity."

Each risk MUST include:
1) **Concrete cause**: which persona objection, country regulation, or pricing-sensitivity signal it derives from.
2) **Business impact**: quantify when possible ("first-90-day revenue down 40%", "CAC up 1.5x", "launch delayed 3 months").
3) **Affected market(s)**: name the country / countries most exposed (e.g. "US-only", "JP + GB").

Produce 5-8 distinct risks. Collapse variants of the same root cause into one. Severity reflects probability × impact.

Bad: { "factor": "Regulatory risk", "severity": "medium", "description": "Must comply with local regulation." }
Good: { "factor": "Amazon US absence — Stylevana/YesStyle dependency", "severity": "high", "description": "42 of 67 US personas cite Amazon US as primary purchase channel. Selling only via Stylevana risks losing ~55% of first-90-day revenue." }`
}

Return a JSON object:
{
  "overview": {
    "successScore": 0-100,
    "bestCountry": "country code, must be from: ${input.candidateCountries.join(", ")}",
    "bestSegment": "concise persona description in ${LANG_NAME[locale]}",
    "bestPriceCents": int,
    "bestCreative": ${hasDescriptions || hasImages ? `"assetName of highest-scoring creative, in ${LANG_NAME[locale]}"` : "null"},
    "riskLevel": "low|medium|high",
    "headline": "one-sentence verdict in ${LANG_NAME[locale]}"
  },
  "creative": [],
  "risks": [ { "factor": "(in ${LANG_NAME[locale]}, see RISK WRITING GUIDANCE above)", "severity": "low|medium|high", "description": "(specific + quantified, in ${LANG_NAME[locale]})", "category": "<one of the risk taxonomy enum codes below>" } ],
  "recommendations": {
    "executiveSummary": "2-3 paragraphs in ${LANG_NAME[locale]}",
    "actionPlan": [ "concrete steps in ${LANG_NAME[locale]}" ],
    "actionPlanCategorized": [ { "category": "<one of the action taxonomy enum codes below>", "detail": "(same string as the corresponding actionPlan entry above)" } ],
    "channels": [ "channel names — keep brand names like TikTok, Instagram in original" ]
  }
}

═══ RISK TAXONOMY (HARD RULE — every risk MUST carry a category code) ═══
${taxonomyPromptBlock("risk", locale === "ko" ? "ko" : "en")}

═══ ACTION TAXONOMY (HARD RULE — every actionPlan entry MUST carry a category code) ═══
${taxonomyPromptBlock("action", locale === "ko" ? "ko" : "en")}

⚠ The detail string in actionPlanCategorized[i] MUST equal the string in actionPlan[i] — they are parallel views of the same items. The renderer aggregates by category for cross-country comparison and shows detail (i.e. actionPlan[i]) verbatim in lists. Inconsistency between the two arrays may cause the action to be dropped at validation.
${
  locale === "ko"
    ? `
═══ 영문 마케팅 약어 표기 규칙 (한국어 출력 시 필수) ═══
한국어 출력에서 영문 마케팅 약어 (USP, ICP, KPI, GTM, MOQ, ROI, LTV, CAC, ARPU, AOV, SKU, MVP, B2B, B2C, DTC, COGS, A/B 테스트 등) 를 사용할 때, **첫 등장 시 반드시 풀 영문 + 한국어 설명을 괄호로 병기**하세요. 두 번째 등장부터는 약어만 써도 됩니다. 형식: \`약어 (Full English Form · 한국어 설명)\`.
예시:
  ✓ "USP (Unique Selling Proposition · 핵심 차별점) 로 ..." (첫 등장)
  ✓ "이 USP 가 ..." (두 번째 이후)
  ✗ "핵심 USP 로 ..." (첫 등장인데 풀 폼 없음)
  ✓ "ICP (Ideal Customer Profile · 이상적 고객 프로필) 는 25-38세 도시 직장인"
  ✓ "GTM (Go-to-Market · 시장 진입) 전략은 ..."
  ✓ "CAC (Customer Acquisition Cost · 고객 획득 비용) 는 ..."
  ✓ "MOQ (Minimum Order Quantity · 최소 주문 수량) 1,000개 ..."
이 규칙은 비-마케팅 founder 도 약어 막힘 없이 읽을 수 있게 하기 위함. 마케팅 백그라운드 가정 금지.`
    : ""
}`;
}
