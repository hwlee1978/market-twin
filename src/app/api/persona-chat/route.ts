import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { getLLMProvider } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/persona-chat
 *
 * Lets the user follow up with a persona surfaced in an ensemble result.
 * Demo wow-factor feature: instead of reading static voice quotes, the
 * user clicks a persona and asks "왜 이 가격이 비싸다고 했어요?" — the
 * LLM responds in 1st person staying in character.
 *
 * Stateless on the server side: every request carries the persona profile
 * and the conversation history, so the user can resume a chat without us
 * persisting threads. Keeps the schema small for v1; if we need multi-
 * device sync later we add a chats table.
 *
 * Cost: ~$0.005-0.01 per message (Haiku-class). Workspace must be active.
 */

const PersonaSchema = z.object({
  // Required fields — these come from the voice card the user clicked
  voice: z.string().min(1).max(2000),
  country: z.string().min(2).max(8),
  intent: z.number().min(0).max(100),
  // Optional context — fill what's available; LLM tolerates missing pieces
  profession: z.string().max(120).optional(),
  ageRange: z.string().max(40).optional(),
  gender: z.string().max(40).optional(),
  incomeBand: z.string().max(120).optional(),
  trustFactors: z.array(z.string()).max(8).optional(),
  objections: z.array(z.string()).max(8).optional(),
});

const TurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const RequestSchema = z.object({
  persona: PersonaSchema,
  question: z.string().min(1).max(1000),
  history: z.array(TurnSchema).max(20).optional(),
  productName: z.string().max(200).optional(),
  productCategory: z.string().max(120).optional(),
  basePrice: z.string().max(40).optional(),
  locale: z.enum(["ko", "en"]).default("ko"),
});

export async function POST(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") {
    return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { persona, question, history, productName, productCategory, basePrice, locale } =
    parsed.data;

  const isKo = locale === "ko";
  const system = isKo
    ? `당신은 시장 조사 시뮬레이션의 페르소나입니다. 아래 프로필 + 원본 voice를 보고, 그 사람의 입장에서 1인칭으로 답하세요.

== 페르소나 프로필 ==
- 거주국: ${persona.country}
- 직업: ${persona.profession ?? "(미상)"}
- 연령대: ${persona.ageRange ?? "(미상)"}
- 성별: ${persona.gender ?? "(미상)"}
- 소득대: ${persona.incomeBand ?? "(미상)"}
- 이 제품에 대한 구매의향: ${persona.intent}/100
${persona.trustFactors?.length ? `- 신뢰 요인: ${persona.trustFactors.join(", ")}` : ""}
${persona.objections?.length ? `- 거부 요인: ${persona.objections.join(", ")}` : ""}

== 평가 대상 제품 ==
${productName ? `- 제품: ${productName}` : ""}
${productCategory ? `- 카테고리: ${productCategory}` : ""}
${basePrice ? `- 가격: ${basePrice}` : ""}

== 원본 응답 ==
"${persona.voice}"

== 응답 규칙 ==
1. 반드시 1인칭("저는...")으로, 그 사람의 직업·연령·소득에 맞는 말투로 답하세요.
2. 짧고 자연스럽게. 보통 2-4문장. 길면 5문장.
3. 원본 voice의 입장(찬성/거부)과 일관성 유지. 갑자기 의견을 뒤집지 마세요.
4. 모르는 내용은 추측하지 말고 "잘 모르겠다"고 답하세요.
5. 마케팅 카피 톤 금지. 진짜 사람이 카톡으로 답하는 톤.
6. 한국어로 답하세요.`
    : `You are a persona from a market research simulation. Based on the profile + original voice below, answer in first person, staying in character.

== Persona profile ==
- Country: ${persona.country}
- Profession: ${persona.profession ?? "(unknown)"}
- Age range: ${persona.ageRange ?? "(unknown)"}
- Gender: ${persona.gender ?? "(unknown)"}
- Income band: ${persona.incomeBand ?? "(unknown)"}
- Purchase intent for this product: ${persona.intent}/100
${persona.trustFactors?.length ? `- Trust factors: ${persona.trustFactors.join(", ")}` : ""}
${persona.objections?.length ? `- Objections: ${persona.objections.join(", ")}` : ""}

== Product being evaluated ==
${productName ? `- Product: ${productName}` : ""}
${productCategory ? `- Category: ${productCategory}` : ""}
${basePrice ? `- Price: ${basePrice}` : ""}

== Original response ==
"${persona.voice}"

== Reply rules ==
1. Always speak in first person, in a tone matching this person's job, age, income.
2. Keep it short and natural. Usually 2-4 sentences, max 5.
3. Stay consistent with the original voice's stance (for/against). Don't flip-flop.
4. If you don't know, say so — don't fabricate.
5. No marketing copy. Sound like a real person texting a friend.
6. Reply in English.`;

  // Build the prompt as a single user message containing prior turns.
  // The persona-staging system prompt is the heavy lift; turn history just
  // tells the LLM where the conversation has been so it doesn't repeat.
  const transcript = (history ?? [])
    .map((t) => `${t.role === "user" ? "Q" : "A"}: ${t.content}`)
    .join("\n");
  const prompt = transcript
    ? `${transcript}\nQ: ${question}\nA:`
    : `Q: ${question}\nA:`;

  // Use the synthesis-stage model so chat replies have the same quality
  // bar as the executive summary. Single-turn cost is small; routing
  // through Haiku here would noticeably degrade voice fidelity.
  const llm = getLLMProvider({ stage: "synthesis" });
  try {
    const t0 = Date.now();
    const res = await llm.generate({
      system,
      prompt,
      temperature: 0.6,
      maxTokens: 600,
    });
    const reply = (res.text ?? "").trim();
    if (!reply) {
      return NextResponse.json({ error: "empty_response" }, { status: 502 });
    }
    return NextResponse.json({
      reply,
      tookMs: Date.now() - t0,
      model: `${llm.name}/${llm.model}`,
    });
  } catch (err) {
    console.error("[persona-chat]", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "llm_failed", detail: message }, { status: 502 });
  }
}
