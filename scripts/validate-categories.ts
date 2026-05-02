/**
 * Category-coverage smoke test — runs persona generation for each of the 7
 * non-beauty categories (food / health / fashion / electronics / home /
 * saas / ip) using a representative product fixture per category. Emits a
 * markdown report so we can spot:
 *
 *   - slot planning failures (no profession assigned, wrong country)
 *   - voice cap violations (KO ≤ 90 chars)
 *   - profession diversity collapse (same base profession >2 times)
 *   - parse failures or under-delivery
 *   - obviously broken / generic voices
 *
 * Locale fixed to KO (primary user locale). EN can be added if any KO
 * category fails — same prompt path so KO surfaces the structural issues.
 *
 * Usage:
 *   npm run validate:categories
 *
 * Output: validate-categories-<timestamp>.md in the project root.
 */
import { writeFileSync } from "fs";
import { AnthropicProvider } from "../src/lib/llm/anthropic";
import { planSlots, type PersonaSlot } from "../src/lib/simulation/profession-pool";
import { personaPrompt, PERSONA_SYSTEM } from "../src/lib/simulation/prompts";
import { PersonaSchema, type ProjectInput } from "../src/lib/simulation/schemas";

const SONNET = "claude-sonnet-4-6";

const PERSONA_COUNT = 8;
const TARGETS = ["US", "JP"];
const SEED = "validate-categories-2026-05-02";
const LOCALE = "ko" as const;

type Fixture = {
  category: string;
  productName: string;
  description: string;
  basePriceCents: number;
  currency: string;
};

const FIXTURES: Fixture[] = [
  {
    category: "food",
    productName: "삼양 불닭볶음면 (Buldak Hot Chicken)",
    description:
      "한국 매운맛 라면. 글로벌 챌린지 영상으로 입소문, 미국·일본 아시안 마트 중심으로 빠르게 확산 중. 5개입 번들.",
    basePriceCents: 1500,
    currency: "USD",
  },
  {
    category: "health",
    productName: "정관장 홍삼정 에브리타임",
    description:
      "한국 6년근 홍삼 농축 스틱 30포. 면역·피로회복 일일 스틱 포맷. 면세점·마트에서 한국인 수요 검증된 라인업, 해외 한방 보충제 시장 진입 시도.",
    basePriceCents: 4500,
    currency: "USD",
  },
  {
    category: "fashion",
    productName: "마틴킴 (Martine Kim) 미니 토트백",
    description:
      "한국 컨템포러리 디자이너 브랜드의 시그니처 미니 토트. 블랙핑크 멤버 착용으로 글로벌 검색 급증. 합성 가죽, 베이직 컬러 4종.",
    basePriceCents: 18000,
    currency: "USD",
  },
  {
    category: "electronics",
    productName: "Samsung Galaxy Buds3 Pro",
    description:
      "한국 제조 하이엔드 무선 이어폰. 액티브 노이즈 캔슬링, 24비트 무손실, 일본 대비 30% 가격 경쟁력. 갤럭시 생태계 외 사용자 흡수 시도.",
    basePriceCents: 22000,
    currency: "USD",
  },
  {
    category: "home",
    productName: "락앤락 클래식 밀폐용기 12종 세트",
    description:
      "한국 No.1 밀폐용기 브랜드. 사각·원형 혼합 12종 BPA-free 세트. 일본·미국 아시안 마트에서 인지도 보유, 중산층 주방 수납 솔루션으로 포지셔닝.",
    basePriceCents: 6500,
    currency: "USD",
  },
  {
    category: "saas",
    productName: "Channel Talk (채널톡) — 글로벌 SMB 플랜",
    description:
      "한국 SMB 1위 인앱 메신저·CRM. 채팅 봇 + 라이브챗 + 고객 데이터 통합. 영어 UI 추가, 일본·미국 SMB 시장 진입. 월 $49부터 시작하는 SMB 플랜.",
    basePriceCents: 4900,
    currency: "USD",
  },
  {
    category: "ip",
    productName: "카카오프렌즈 라이언 플러시 (Lion Plush, 30cm)",
    description:
      "카카오톡 IP의 대표 캐릭터 라이언 인형. 30cm 표준 사이즈. 한국 카카오프렌즈 스토어 베스트셀러, 동남아·일본에서 K-character 굿즈 수요 확인. 정품 인증 라벨.",
    basePriceCents: 3900,
    currency: "USD",
  },
];

async function generateBatch(slots: PersonaSlot[], category: string, fixture: Fixture) {
  const provider = new AnthropicProvider(SONNET);
  const projectInput: ProjectInput = {
    productName: fixture.productName,
    category: fixture.category,
    description: fixture.description,
    basePriceCents: fixture.basePriceCents,
    currency: fixture.currency,
    objective: "expansion",
    originatingCountry: "KR",
    candidateCountries: TARGETS,
    competitorUrls: [],
    assetDescriptions: [],
    assetUrls: [],
  };
  const t0 = Date.now();
  const r = await provider.generate({
    system: PERSONA_SYSTEM,
    prompt: personaPrompt(projectInput, slots, LOCALE, ""),
    jsonSchema: { type: "object", properties: { personas: { type: "array" } } },
    temperature: 0.6,
    maxTokens: 8192,
  });
  const ms = Date.now() - t0;
  const wrapped = (r.json as { personas?: unknown[] } | null)?.personas;
  const arr = Array.isArray(wrapped) ? wrapped : [];
  const parsed = arr
    .map((p) => PersonaSchema.safeParse(p))
    .map((res, i) => ({ ok: res.success, data: res.success ? res.data : null, raw: arr[i] }));
  return {
    parsed,
    ms,
    inputTokens: r.usage?.inputTokens ?? 0,
    outputTokens: r.usage?.outputTokens ?? 0,
  };
}

function voiceCharCount(s: string): number {
  return [...s].length;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY env var is required.");
    process.exit(1);
  }

  console.log(
    `Validating ${FIXTURES.length} categories — ${PERSONA_COUNT} personas each, ` +
      `targets ${TARGETS.join("+")}, locale ${LOCALE}, model ${SONNET}.\n`,
  );

  const tStart = Date.now();
  const out: string[] = [];
  out.push(`# Category coverage smoke test`);
  out.push(``);
  out.push(
    `*${new Date().toISOString()} · ${FIXTURES.length} categories × ${PERSONA_COUNT} personas · targets ${TARGETS.join("+")} · locale ${LOCALE} · model ${SONNET}*`,
  );
  out.push(``);

  type Row = {
    category: string;
    parsed: number;
    total: number;
    professionMatchSlot: number;
    countryMatchSlot: number;
    capViolations: number;
    avgVoiceLen: number;
    distinctBaseProfessions: number;
    overusedProfessions: string[];
    ms: number;
    outputTokens: number;
    sampleVoices: Array<{ profession: string; country: string; intent: number; voice: string }>;
    slotMismatches: Array<{ index: number; expected: string; actual: string }>;
    nonLocaleVoices: Array<{ profession: string; country: string; voice: string }>;
  };

  // Cheap heuristic: voice should be in locale script. For locale "ko",
  // a voice that contains zero hangul codepoints is a clear language slip.
  function isVoiceInLocale(voice: string, locale: "ko" | "en"): boolean {
    if (!voice) return true;
    const hasHangul = /[가-힯]/.test(voice);
    if (locale === "ko") return hasHangul;
    // For "en" we don't penalize — Latin script is the default.
    return true;
  }

  const rows: Row[] = [];
  const tasks = FIXTURES.map((fixture) => async () => {
    const slots: PersonaSlot[] = planSlots(
      PERSONA_COUNT,
      TARGETS,
      fixture.category,
      LOCALE,
      `${SEED}-${fixture.category}`,
    );
    const result = await generateBatch(slots, fixture.category, fixture);

    const parsedPersonas = result.parsed
      .map((r, i) => ({ data: r.data, slot: slots[i] }))
      .filter((p): p is { data: NonNullable<typeof p.data>; slot: PersonaSlot } => !!p.data);

    let professionMatchSlot = 0;
    let countryMatchSlot = 0;
    let capViolations = 0;
    let voiceLenSum = 0;
    let voiceLenN = 0;
    const baseProfessionCounts: Record<string, number> = {};
    const slotMismatches: Array<{ index: number; expected: string; actual: string }> = [];
    const nonLocaleVoices: Array<{ profession: string; country: string; voice: string }> = [];

    // Slot match: persona profession must START WITH the slot's base
    // archetype. Strip the trailing "(...)" specialization from the slot
    // string first — the model is allowed (and encouraged) to enrich it
    // by adding context inside or after the parens. Without this strip,
    // perfectly valid outputs like "자녀 둔 학부모 (디지털 기기 구매, 자녀 2명)"
    // get flagged against a slot of "자녀 둔 학부모 (디지털 기기 구매)".
    parsedPersonas.forEach(({ data, slot }, idx) => {
      if (slot.profession) {
        const slotBase = slot.profession.replace(/\s*\([^)]*\)\s*$/, "").trim();
        if (data.profession?.startsWith(slotBase)) {
          professionMatchSlot++;
        } else {
          slotMismatches.push({ index: idx, expected: slot.profession, actual: data.profession });
        }
      }
      if (data.country === slot.country) countryMatchSlot++;
      if (data.voice) {
        const len = voiceCharCount(data.voice);
        voiceLenSum += len;
        voiceLenN++;
        if (len > 90) capViolations++;
        if (!isVoiceInLocale(data.voice, LOCALE)) {
          nonLocaleVoices.push({ profession: data.profession, country: data.country, voice: data.voice });
        }
      }
      const base = slot.profession || "<free>";
      baseProfessionCounts[base] = (baseProfessionCounts[base] ?? 0) + 1;
    });

    const overused = Object.entries(baseProfessionCounts)
      .filter(([, n]) => n > 2)
      .map(([k, n]) => `${k} (${n}×)`);

    const sampleVoices = parsedPersonas
      .filter((p) => !!p.data.voice)
      .slice(0, 3)
      .map((p) => ({
        profession: p.data.profession,
        country: p.data.country,
        intent: p.data.purchaseIntent,
        voice: p.data.voice ?? "",
      }));

    rows.push({
      category: fixture.category,
      parsed: parsedPersonas.length,
      total: PERSONA_COUNT,
      professionMatchSlot,
      countryMatchSlot,
      capViolations,
      avgVoiceLen: voiceLenN ? Math.round(voiceLenSum / voiceLenN) : 0,
      distinctBaseProfessions: Object.keys(baseProfessionCounts).length,
      overusedProfessions: overused,
      ms: result.ms,
      outputTokens: result.outputTokens,
      sampleVoices,
      slotMismatches,
      nonLocaleVoices,
    });

    console.log(
      `  ${fixture.category}: ${parsedPersonas.length}/${PERSONA_COUNT} parsed, ` +
        `${professionMatchSlot}/${PERSONA_COUNT} prof-slot match, ` +
        `${capViolations} cap violations, ${result.ms}ms`,
    );
  });

  // Run all categories in parallel — well under Anthropic Tier 2 RPM/TPM.
  await Promise.all(tasks.map((t) => t()));

  // Sort rows back to fixture order for stable output.
  rows.sort(
    (a, b) =>
      FIXTURES.findIndex((f) => f.category === a.category) -
      FIXTURES.findIndex((f) => f.category === b.category),
  );

  // ── Summary table ──
  out.push(`## Summary`);
  out.push(``);
  out.push(
    `| Category | Parsed | Prof-slot match | Country match | Cap violations | Avg voice len | Distinct base prof | Latency |`,
  );
  out.push(`|---|---|---|---|---|---|---|---|`);
  for (const r of rows) {
    const flag =
      r.parsed < r.total ||
      r.professionMatchSlot < r.total ||
      r.countryMatchSlot < r.total ||
      r.capViolations > 0 ||
      r.overusedProfessions.length > 0
        ? "⚠️ "
        : "✓ ";
    out.push(
      `| ${flag}${r.category} | ${r.parsed}/${r.total} | ${r.professionMatchSlot}/${r.total} | ${r.countryMatchSlot}/${r.total} | ${r.capViolations} | ${r.avgVoiceLen}ch | ${r.distinctBaseProfessions} | ${r.ms}ms |`,
    );
  }
  out.push(``);
  out.push(`**Legend**: ✓ all pass · ⚠️ at least one issue (parse / slot mismatch / cap / overuse).`);
  out.push(``);

  // ── Per-category detail ──
  for (const r of rows) {
    out.push(`## ${r.category}`);
    out.push(``);
    out.push(
      `Parsed ${r.parsed}/${r.total} · prof-slot match ${r.professionMatchSlot}/${r.total} · country match ${r.countryMatchSlot}/${r.total} · ` +
        `cap violations ${r.capViolations} · avg voice ${r.avgVoiceLen}ch · ${r.distinctBaseProfessions} distinct base professions · ${r.ms}ms · out=${r.outputTokens}tk.`,
    );
    out.push(``);
    if (r.overusedProfessions.length > 0) {
      out.push(`⚠️ Overused base professions: ${r.overusedProfessions.join(", ")}`);
      out.push(``);
    }
    if (r.slotMismatches.length > 0) {
      out.push(`### ⚠️ Slot profession mismatches (${r.slotMismatches.length})`);
      out.push(``);
      for (const m of r.slotMismatches) {
        out.push(`- Slot ${m.index + 1}: expected \`${m.expected}\` → got \`${m.actual}\``);
      }
      out.push(``);
    }
    if (r.nonLocaleVoices.length > 0) {
      out.push(`### ⚠️ Voices NOT in locale (${r.nonLocaleVoices.length})`);
      out.push(``);
      for (const v of r.nonLocaleVoices) {
        out.push(`- _(${v.profession}, ${v.country})_`);
        out.push(`  > ${v.voice}`);
      }
      out.push(``);
    }
    out.push(`### Sample voices`);
    out.push(``);
    for (const v of r.sampleVoices) {
      out.push(`- _(${v.profession}, ${v.country}, intent ${v.intent}, ${voiceCharCount(v.voice)}ch)_`);
      out.push(`  > ${v.voice}`);
    }
    out.push(``);
  }

  out.push(`---`);
  out.push(`Total wall time: ${((Date.now() - tStart) / 1000).toFixed(1)}s`);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `validate-categories-${stamp}.md`;
  writeFileSync(filename, out.join("\n"), "utf8");
  console.log(`\nWrote ${filename}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
