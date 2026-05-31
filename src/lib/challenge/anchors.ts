/**
 * 챌린지 Task 2 — 공공데이터 그라운딩 (Market Twin anchor 재활용).
 *
 * 변별력 핵심: 다른 응모자들이 raw LLM으로 "동남아 화장품 시장은 성장
 * 중..." 일반론 리포트를 내놓을 때, 우리는 4개 공공 API에서 즉시 가져온
 * 실제 수치를 LLM 프롬프트에 grounding으로 넣고 리포트가 이를 인용하게
 * 함. 모두 standalone callable이라 ensemble 풀 파이프라인 없이 ~30초.
 *
 * 4개 anchor:
 *   ① Hofstede 6-dim — 사내 reference data table (sync, 즉시)
 *   ② World Bank Open Data — GDP/cap, 인구, 가계소비 (key-free, ~3s)
 *   ③ KOTRA korCompList — 타겟국 진출 한국기업 명단 (DATAGOKR key, ~5s)
 *   ④ UN Comtrade — KR→타겟국 HSCode 수출 추세 3년 (key-free, ~3s)
 *
 * Best-effort: 개별 anchor 실패는 비-치명. 가능한 만큼만 리포트에 인용.
 */

import { getHofstede, type HofstedeProfile } from "@/lib/reference/hofstede-dimensions";
import { fetchWorldBankIndicators, type WorldBankIndicators } from "@/lib/market-research/world-bank";
import { fetchKotraNationalInfo, type KotraKoreanCompany } from "@/lib/market-research/kotra";
import { fetchKoreaExportFlows, hsCodesForCategory } from "@/lib/market-research/comtrade";

type YearlyFlow = { year: number; tradeValueUsd: number };

export type Iso2 = string;
export type Category =
  | "beauty"
  | "food"
  | "fashion"
  | "electronics"
  | "alcohol"
  | "beverage"
  | "health"
  | "home"
  | "ip"
  | "other";

export type PublicDataGrounding = {
  targetCountry: Iso2;
  category: Category;
  hofstede: {
    korea: HofstedeProfile;
    target: HofstedeProfile;
    distance: number;                  // 0-100, euclidean (avg of 6 dims)
  } | null;
  worldBank: WorldBankIndicators | null;
  kotra: {
    totalKoreanCompanies: number;
    categoryMatched: KotraKoreanCompany[];   // 최대 8개
  } | null;
  comtrade: {
    hsCodes: string[];
    flows: YearlyFlow[];               // 연도별 합산값
    yoyGrowthPct: number | null;       // 가장 최근 vs 직전 연도 %
  } | null;
  fetched_ms: number;
  errors: string[];                    // 디버깅용 — 어느 anchor 실패했는지
};

/* ────────────────────────────────── inference ─── */

// 한국어 goal/program_name 텍스트에서 타겟국 ISO2 추출. 자주 등장하는
// 표현만 매핑 — fuzzy NFC 정규화 + 부분 매칭.
const COUNTRY_KEYWORDS: Array<[RegExp, Iso2]> = [
  [/베트남|vietnam|호치민|하노이/i, "VN"],
  [/태국|thailand|방콕/i, "TH"],
  [/인니|인도네시아|indonesia|자카르타/i, "ID"],
  [/필리핀|philippines|마닐라/i, "PH"],
  [/말레이|malaysia|쿠알라/i, "MY"],
  [/싱가포르|singapore/i, "SG"],
  [/대만|타이완|taiwan|타이베이/i, "TW"],
  [/홍콩|hong\s*kong/i, "HK"],
  [/일본|japan|도쿄|오사카/i, "JP"],
  [/중국|china|상하이|베이징|광저우|심천/i, "CN"],
  [/미국|미주|usa|united\s*states|america|뉴욕|la|캘리포니아/i, "US"],
  [/캐나다|canada|토론토|밴쿠버/i, "CA"],
  [/멕시코|mexico/i, "MX"],
  [/브라질|brazil/i, "BR"],
  [/영국|uk|england|런던/i, "GB"],
  [/독일|germany|베를린/i, "DE"],
  [/프랑스|france|파리/i, "FR"],
  [/이탈리아|italy/i, "IT"],
  [/스페인|spain/i, "ES"],
  [/네덜란드|netherlands/i, "NL"],
  [/호주|australia|시드니/i, "AU"],
  [/인도|india|뭄바이|델리/i, "IN"],
  [/사우디|saudi/i, "SA"],
  [/uae|아랍에미리트|두바이/i, "AE"],
  // 동남아 일반 → 가장 큰 시장 VN 대표 (다른 anchor가 region detail 보충)
  [/동남아|asean/i, "VN"],
];

export function inferTargetCountry(
  goal: string | undefined,
  recommendations: Array<{ program_name: string; type: "domestic" | "export" }>,
): Iso2 | null {
  const haystacks: string[] = [];
  if (goal) haystacks.push(goal);
  // 수출 sourced 추천만 — 내수는 KR이라 country anchor 무의미
  for (const r of recommendations) {
    if (r.type === "export") haystacks.push(r.program_name);
  }
  const text = haystacks.join(" ").normalize("NFC");
  for (const [re, iso] of COUNTRY_KEYWORDS) {
    if (re.test(text)) return iso;
  }
  return null;
}

const CATEGORY_KEYWORDS: Array<[RegExp, Category]> = [
  [/화장품|코스메틱|뷰티|스킨케어|메이크업|cosmet|beauty/i, "beauty"],
  [/식품|식음료|가공식품|라면|김치|만두|스낵|food/i, "food"],
  [/주류|소주|맥주|와인|위스키|alcohol|liquor/i, "alcohol"],
  [/음료|차|커피|주스|beverage|drink/i, "beverage"],
  [/신발|의류|패션|어패럴|fashion|apparel|footwear/i, "fashion"],
  [/전자|가전|디스플레이|tv|스마트폰|electronic|appliance/i, "electronics"],
  [/건강기능|건강식품|인삼|홍삼|영양제|health|supplement/i, "health"],
  [/생활용품|주방|가정용|home/i, "home"],
  [/ip|콘텐츠|굿즈|캐릭터|merchand/i, "ip"],
];

export function inferCategory(
  product: { name?: string; category?: string; description?: string } | undefined,
): Category {
  if (!product) return "other";
  const text = `${product.category ?? ""} ${product.name ?? ""} ${product.description ?? ""}`
    .normalize("NFC")
    .toLowerCase();
  for (const [re, cat] of CATEGORY_KEYWORDS) {
    if (re.test(text)) return cat;
  }
  return "other";
}

/* ────────────────────────────────── fetcher ─── */

const KR_ISO2 = "KR";

function hofstedeDistance(a: HofstedeProfile, b: HofstedeProfile): number {
  const dims: Array<keyof HofstedeProfile> = [
    "powerDistance",
    "individualism",
    "masculinity",
    "uncertaintyAvoidance",
    "longTermOrientation",
    "indulgence",
  ];
  const sumSq = dims.reduce((acc, d) => {
    const da = (a[d] ?? 0) - (b[d] ?? 0);
    return acc + da * da;
  }, 0);
  // RMS of 6 dims, scaled 0-100. 한 dim 최대 차이 100 → 6개 모두 max면 100.
  return Math.round(Math.sqrt(sumSq / dims.length));
}

export async function buildPublicDataGrounding(
  targetCountry: Iso2,
  category: Category,
): Promise<PublicDataGrounding> {
  const t0 = Date.now();
  const errors: string[] = [];

  // Hofstede (sync, 즉시) — 항상 성공
  let hofstede: PublicDataGrounding["hofstede"] = null;
  try {
    const korea = getHofstede(KR_ISO2);
    const target = getHofstede(targetCountry);
    hofstede = {
      korea,
      target,
      distance: hofstedeDistance(korea, target),
    };
  } catch (e) {
    errors.push(`hofstede: ${e instanceof Error ? e.message : "fail"}`);
  }

  // 나머지 3개 병렬 fetch
  const datagokrKey = process.env.DATAGOKR_API_KEY;
  const hsCodes = hsCodesForCategory(category);

  // Comtrade는 단일 period만 받음 → 3년 추세를 위해 3번 호출 (Y-2/Y-3/Y-4).
  // Y-1은 1-2월 lag 있어 비어 있을 수 있어 Y-2부터 시작.
  // COMTRADE_API_KEY 미설정 시 401 — anchor 비활성 (errors에 기록).
  const comtradeKey = process.env.COMTRADE_API_KEY;
  const baseYear = new Date().getUTCFullYear() - 2;
  const years = [baseYear - 2, baseYear - 1, baseYear];
  // Comtrade 무료 tier rate limit (10 req/s 공식이지만 실제 ~1 req/s) →
  // 3개 연도를 순차 호출 + 1.5s 간격으로 throttle. 429 회피.
  async function fetchComtradeSequential(): Promise<YearlyFlow[]> {
    if (hsCodes.length === 0 || !comtradeKey) return [];
    const out: YearlyFlow[] = [];
    for (let i = 0; i < years.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 1500));
      const year = years[i];
      const flows = await fetchKoreaExportFlows({
        partnerCountries: [targetCountry],
        hsCodes,
        period: year,
        apiKey: comtradeKey,
      });
      out.push({
        year,
        tradeValueUsd: flows.reduce((acc, f) => acc + (f.tradeValueUsd || 0), 0),
      });
    }
    return out;
  }
  const comtradePromise = fetchComtradeSequential();

  const [wbRes, kotraRes, comtradeRes] = await Promise.allSettled([
    fetchWorldBankIndicators([targetCountry]),
    datagokrKey ? fetchKotraNationalInfo(targetCountry, datagokrKey) : Promise.resolve(null),
    comtradePromise,
  ]);

  const worldBank =
    wbRes.status === "fulfilled" && wbRes.value.length > 0 ? wbRes.value[0] : null;
  if (wbRes.status === "rejected") errors.push(`worldBank: ${String(wbRes.reason).slice(0, 100)}`);

  let kotra: PublicDataGrounding["kotra"] = null;
  if (kotraRes.status === "fulfilled" && kotraRes.value) {
    const all = kotraRes.value.koreanCompanies ?? [];
    // 카테고리 keyword로 필터 — KOTRA industry 텍스트가 한국어이므로 우리
    // category enum을 한국어 토큰으로 다시 매핑.
    // KOTRA industry 텍스트는 자유서식이라 broad token 사용 — 너무 좁으면
    // 매칭 0개 (예: "도소매, 유통" 안에 "화장품" 없음).
    const tokens: Record<Category, string[]> = {
      beauty: ["화장품", "코스메틱", "뷰티", "스킨", "퍼스널케어", "생활용품"],
      food: ["식품", "가공", "라면", "스낵", "냉동", "유통"],
      fashion: ["신발", "의류", "패션", "어패럴", "섬유"],
      electronics: ["전자", "가전", "디스플레이", "반도체", "통신"],
      alcohol: ["주류", "소주", "맥주", "와인"],
      beverage: ["음료", "커피", "차", "유음료"],
      health: ["건강", "인삼", "홍삼", "의약", "헬스"],
      home: ["생활", "주방", "가정", "도소매"],
      ip: ["콘텐츠", "캐릭터", "굿즈", "엔터테인먼트"],
      other: [],
    };
    const matchTokens = tokens[category];
    const matched =
      matchTokens.length > 0
        ? all.filter((c) =>
            matchTokens.some(
              (t) => (c.industry ?? "").includes(t) || (c.category ?? "").includes(t),
            ),
          )
        : all;
    kotra = {
      totalKoreanCompanies: all.length,
      categoryMatched: matched.slice(0, 8),
    };
  } else if (kotraRes.status === "rejected") {
    errors.push(`kotra: ${String(kotraRes.reason).slice(0, 100)}`);
  } else if (!datagokrKey) {
    errors.push("kotra: DATAGOKR_API_KEY 미설정 — Vercel env에 추가 필요");
  }

  if (!comtradeKey && hsCodes.length > 0) {
    errors.push("comtrade: COMTRADE_API_KEY 미설정 — 신규 UN Comtrade API는 401 응답");
  }

  let comtrade: PublicDataGrounding["comtrade"] = null;
  if (comtradeRes.status === "fulfilled") {
    const flows = comtradeRes.value.filter((f) => f.tradeValueUsd > 0);
    const byYear = [...flows].sort((a, b) => a.year - b.year);
    let yoy: number | null = null;
    if (byYear.length >= 2) {
      const last = byYear[byYear.length - 1];
      const prev = byYear[byYear.length - 2];
      if (prev.tradeValueUsd > 0) {
        yoy = Math.round(((last.tradeValueUsd - prev.tradeValueUsd) / prev.tradeValueUsd) * 1000) / 10;
      }
    }
    comtrade = { hsCodes, flows: byYear, yoyGrowthPct: yoy };
  } else {
    errors.push(`comtrade: ${String(comtradeRes.reason).slice(0, 100)}`);
  }

  return {
    targetCountry,
    category,
    hofstede,
    worldBank,
    kotra,
    comtrade,
    fetched_ms: Date.now() - t0,
    errors,
  };
}

/* ────────────────────────────────── KR 단위 formatter ─── */

/**
 * 한국식 인구 표기 — "1억 100만 명" / "3,900만 명".
 * 미국식 "101.0M" 보다 한국 독자가 즉시 규모 인식 가능.
 */
export function fmtKoPopulation(n: number): string {
  if (!Number.isFinite(n)) return "n/a";
  const eok = Math.floor(n / 1e8);
  const man = Math.floor((n - eok * 1e8) / 1e4);
  if (eok > 0) {
    return man > 0 ? `${eok}억 ${man.toLocaleString()}만 명` : `${eok}억 명`;
  }
  return man > 0 ? `${man.toLocaleString()}만 명` : `${Math.round(n).toLocaleString()}명`;
}

/**
 * 한국식 큰 금액 USD 표기 — "8,661억 달러" / "3조 달러" / "5억 2천만 달러".
 * 가계소비, 수출액 등 대규모 금액용. $XXXm/B 보다 한국 독자 친화적.
 */
export function fmtKoUsd(n: number): string {
  if (!Number.isFinite(n)) return "n/a";
  if (n >= 1e12) {
    const jo = n / 1e12;
    return `${jo.toFixed(jo >= 10 ? 1 : 2)}조 달러`;
  }
  if (n >= 1e8) {
    const eok = Math.floor(n / 1e8);
    const cheonman = Math.floor((n - eok * 1e8) / 1e7);
    if (eok >= 100) return `${eok.toLocaleString()}억 달러`;
    if (cheonman > 0) return `${eok}억 ${cheonman}천만 달러`;
    return `${eok}억 달러`;
  }
  if (n >= 1e4) {
    // 만 단위 (1만 ~ 1억 미만): "8,700만 달러", "500만 달러"
    return `${Math.round(n / 1e4).toLocaleString()}만 달러`;
  }
  return `$${Math.round(n).toLocaleString()}`;
}

/**
 * 한국식 1인당 금액 (소규모) — "5만 2,000달러" / "4,323달러".
 * 1인당 GDP처럼 자릿수가 작은 값용.
 */
export function fmtKoUsdSmall(n: number): string {
  if (!Number.isFinite(n)) return "n/a";
  if (n >= 1e4) {
    const man = Math.floor(n / 1e4);
    const rest = Math.round((n - man * 1e4) / 100) * 100;
    if (rest > 0) return `${man}만 ${rest.toLocaleString()}달러`;
    return `${man}만 달러`;
  }
  return `${Math.round(n).toLocaleString()}달러`;
}

/* ────────────────────────────────── prompt formatter ─── */

/**
 * LLM 프롬프트에 끼워넣는 grounding 블록. 리포트가 이 데이터를 직접
 * 인용하도록 system 프롬프트에서 "공공데이터 수치 인용 필수" 규칙 추가.
 */
export function renderGroundingBlock(g: PublicDataGrounding): string {
  const lines: string[] = [
    `## 공공데이터 grounding (타겟국 ${g.targetCountry}, category ${g.category})`,
    `리포트는 아래 수치를 반드시 인용 — 추정·창작 금지.`,
    "",
  ];

  if (g.hofstede) {
    lines.push(
      `### Hofstede 문화거리 KR↔${g.targetCountry}: ${g.hofstede.distance}점 ` +
        `(${g.hofstede.distance < 30 ? "매우 가까움" : g.hofstede.distance < 50 ? "보통" : "먼 거리"})`,
    );
    const dims: Array<[keyof HofstedeProfile, string]> = [
      ["powerDistance", "권력거리"],
      ["individualism", "개인주의"],
      ["masculinity", "남성성"],
      ["uncertaintyAvoidance", "불확실성회피"],
      ["longTermOrientation", "장기지향"],
      ["indulgence", "탐닉"],
    ];
    for (const [k, label] of dims) {
      lines.push(`  ${label}: KR ${g.hofstede.korea[k]} vs ${g.targetCountry} ${g.hofstede.target[k]}`);
    }
    lines.push("");
  }

  if (g.worldBank) {
    const wb = g.worldBank;
    lines.push(`### World Bank 거시지표 (${wb.year})`);
    lines.push(
      `  인구 ${fmtKoPopulation(wb.population)}  ·  ` +
        `1인당 GDP(PPP) ${fmtKoUsdSmall(wb.gdpPerCapitaPpp)}  ·  ` +
        `가계소비 ${fmtKoUsd(wb.householdConsumptionPpp)}`,
    );
    lines.push("");
  }

  if (g.kotra) {
    lines.push(`### KOTRA — ${g.targetCountry} 진출 한국기업`);
    lines.push(`  전체 ${g.kotra.totalKoreanCompanies}개사  ·  ${g.category} 카테고리 매칭 ${g.kotra.categoryMatched.length}개사`);
    for (const c of g.kotra.categoryMatched.slice(0, 5)) {
      lines.push(`  - ${c.parentName || c.localName}  (${c.industry || c.category})`);
    }
    lines.push("");
  }

  if (g.comtrade && g.comtrade.flows.length > 0) {
    lines.push(`### UN Comtrade — KR→${g.targetCountry} 수출 (HSCode ${g.comtrade.hsCodes.join("/")})`);
    for (const f of g.comtrade.flows) {
      lines.push(`  ${f.year}: ${fmtKoUsd(f.tradeValueUsd)}`);
    }
    if (g.comtrade.yoyGrowthPct !== null) {
      const arrow = g.comtrade.yoyGrowthPct >= 0 ? "▲" : "▼";
      lines.push(`  YoY: ${arrow} ${Math.abs(g.comtrade.yoyGrowthPct)}%`);
    }
    lines.push("");
  }

  if (g.errors.length > 0) {
    lines.push(`### (조회 실패: ${g.errors.length}개)`);
    for (const e of g.errors) lines.push(`  - ${e}`);
  }

  return lines.join("\n");
}
