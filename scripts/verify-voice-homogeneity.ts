/**
 * Spot-check for the voice-homogeneity audit. Constructs a synthetic
 * sim with two extreme voice profiles — homogeneous (all paraphrases
 * of "맘에 들어요") vs diverse (genuinely different reactions) — and
 * verifies the audit detects the homogeneous case while leaving the
 * diverse one alone.
 *
 * Run: npx tsx scripts/verify-voice-homogeneity.ts
 */
import { auditQuality } from "../src/lib/quality/audit";
import type { Persona, CountryScore } from "../src/lib/simulation/schemas";

const baseCountryScores: CountryScore[] = [
  {
    country: "JP",
    demandScore: 70,
    cacEstimateUsd: 12.5,
    competitionScore: 60,
    finalScore: 78,
    rank: 1,
    rationale: "test",
  },
  {
    country: "VN",
    demandScore: 60,
    cacEstimateUsd: 9,
    competitionScore: 40,
    finalScore: 65,
    rank: 2,
    rationale: "test",
  },
  {
    country: "TH",
    demandScore: 55,
    cacEstimateUsd: 11,
    competitionScore: 50,
    finalScore: 58,
    rank: 3,
    rationale: "test",
  },
];

function makePersona(voice: string, i: number): Persona {
  return {
    id: `p${i}`,
    ageRange: "25-34",
    gender: i % 2 === 0 ? "F" : "M",
    country: "JP",
    incomeBand: "$50k-60k",
    profession: i % 3 === 0 ? "Designer" : i % 3 === 1 ? "Engineer" : "Marketer",
    interests: ["fashion"],
    purchaseStyle: "considered",
    priceSensitivity: "medium",
    trustFactors: ["reviews"],
    objections: [],
    purchaseIntent: 60 + (i % 20),
    voice,
  };
}

// Homogeneous sim — every voice is a paraphrase of "맘에 들어요" / "좋네요"
const homogeneousVoices = [
  "정말 맘에 들어요. 가격도 적당하고 디자인도 예뻐요.",
  "맘에 들어요. 디자인도 예쁘고 가격도 괜찮네요.",
  "디자인이 예뻐서 맘에 들어요. 가격도 적당해요.",
  "가격도 적당하고 디자인도 예뻐서 좋아요.",
  "괜찮네요. 디자인이 예쁘고 가격도 적당합니다.",
  "맘에 들어요. 가격도 좋고 디자인도 예뻐요.",
  "좋네요. 디자인이 예쁘고 가격도 적당해요.",
  "정말 좋아요. 디자인이 예쁘고 가격도 괜찮네요.",
  "디자인도 예쁘고 가격도 적당해서 맘에 들어요.",
  "예쁘네요. 가격도 적당하고 디자인이 좋아요.",
];

// Diverse sim — genuinely different angles, lengths, sentiments
const diverseVoices = [
  "한국 화장품 좋아하는데 이건 처음 들어봤네. 친구가 추천하면 사 볼 의향 있어.",
  "성분 표시가 영어로 되어 있지 않으면 일본에서 통관에 문제가 있을 수 있을 것 같은데.",
  "TikTok에서 광고 본 적 있어. K-beauty 트렌드라 그냥 한 번 시도해 보고 싶어.",
  "올리브영 일본에 들어왔으니까 거기서 사면 안심될 것 같은데, 본 적 없어서 잘 모르겠어.",
  "가격이 좀 비싸지만 효과가 있다면 살 만하지. 리뷰 많이 보고 결정할게.",
  "내 피부에 맞을지 모르겠어서 샘플 먼저 받아 보고 싶은데 일본에서는 그게 어려운가?",
  "Instagram 인플루언서가 이미 추천해 줬으면 좋을 텐데. 현재로서는 잘 모르겠음.",
  "일본 약국에서 파는 것보다 좀 저렴하면 한 번 시도해 볼 의향 있음. 가격 비교 필요해.",
  "한국 여행 갔을 때 직접 사 보고 싶었는데 못 가져왔어. 일본에서 정식 입점되면 살게.",
  "내 친구 SK-II 쓰는데 그것보다 효과 좋을지 좀 의심스러워. 비교 영상이 있으면 도움 될 듯.",
];

function audit(personas: Persona[]) {
  return auditQuality({
    simulationId: "test",
    workspaceId: "test",
    personas,
    countries: baseCountryScores,
    pricing: null,
    basePriceCents: 5000,
    voiceSlipRate: 0,
    synthesisFailover: false,
    personaCount: personas.length,
    personaCountTarget: personas.length,
  });
}

const homResult = audit(homogeneousVoices.map((v, i) => makePersona(v, i)));
const divResult = audit(diverseVoices.map((v, i) => makePersona(v, i)));

console.log("");
console.log("Homogeneous sim (10 paraphrases of '맘에 들어요'):");
console.log(`  voiceHomogeneity: ${homResult.metrics.voiceHomogeneity?.toFixed(2)}`);
console.log(`  confidenceScore: ${homResult.confidenceScore}`);
console.log(`  quarantined: ${homResult.quarantined}`);
console.log(
  `  warnings: ${homResult.warnings
    .filter((w) => w.code.startsWith("voice_homogeneous"))
    .map((w) => `${w.code} (${w.severity})`)
    .join(", ") || "(none)"}`,
);
console.log("");
console.log("Diverse sim (10 genuinely different reactions):");
console.log(`  voiceHomogeneity: ${divResult.metrics.voiceHomogeneity?.toFixed(2)}`);
console.log(`  confidenceScore: ${divResult.confidenceScore}`);
console.log(`  quarantined: ${divResult.quarantined}`);
console.log(
  `  warnings: ${divResult.warnings
    .filter((w) => w.code.startsWith("voice_homogeneous"))
    .map((w) => `${w.code} (${w.severity})`)
    .join(", ") || "(none)"}`,
);

const homOk =
  (homResult.metrics.voiceHomogeneity ?? 0) >= 0.5 &&
  homResult.warnings.some((w) => w.code === "voice_homogeneous_critical");
const divOk =
  (divResult.metrics.voiceHomogeneity ?? 0) < 0.3 &&
  !divResult.warnings.some((w) => w.code.startsWith("voice_homogeneous"));

console.log("");
console.log(`Homogeneous detection: ${homOk ? "✓ PASS" : "✗ FAIL"}`);
console.log(`Diverse non-flag:      ${divOk ? "✓ PASS" : "✗ FAIL"}`);
process.exit(homOk && divOk ? 0 : 1);
