import Anthropic from "@anthropic-ai/sdk";
import { loadWorkspaceMemories } from "../memory";
import type { MemoryKind } from "../memory";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Mr. AI PDF → Memory Extractor
 *
 * Accepts a PDF (simulation report, consulting deck, market research,
 * 사업계획서 등) and asks Claude Sonnet to extract memory-worthy
 * insights using Anthropic's native PDF document input — no local
 * pdf-parse / pdfjs needed.
 *
 * Why native PDF instead of pre-extracting text:
 *   - Preserves layout signals (tables, headers, figure captions) that
 *     text extraction flattens.
 *   - Sonnet's vision pass reads chart axes, infographic numbers, etc.
 *   - Same model that synthesizes Briefings, so memory style stays
 *     consistent.
 *
 * Limits (Anthropic):
 *   - 32 MB per request, 100 pages.
 *   - ~$3 per million input tokens (Sonnet 4.6). A typical 6-page
 *     ensemble PDF is ~5k tokens → ~$0.02 per extract.
 *
 * Returns DRAFT memory candidates. Server route surfaces them as a
 * preview card; user picks which to actually save via /api/mrai/
 * memories/bulk.
 */

export interface ExtractedMemoryCandidate {
  kind: MemoryKind;
  title: string;
  body: string;
  /** Why this insight is worth remembering (shown in preview). */
  rationale: string;
  /** True when this duplicates an existing memory; UI hides by default. */
  duplicate?: boolean;
}

export interface ExtractInput {
  workspaceId: string;
  pdfBase64: string;
  filename: string;
  /** Optional user hint — "이 PDF는 르무통 일본 진출 시뮬 결과" 등 */
  hint?: string;
  locale?: "ko" | "en";
}

export interface ExtractResult {
  candidates: ExtractedMemoryCandidate[];
  pageCount?: number;
  /** Approximate cost in USD (input tokens × price). */
  costEstimateUsd: number;
}

const MODEL = process.env.ANTHROPIC_PDF_MODEL ?? "claude-sonnet-4-5-20250929";

export async function extractMemoryFromPdf(
  input: ExtractInput,
): Promise<ExtractResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  // Load existing memories so the LLM can flag duplicates instead of
  // creating near-identical rows.
  const existing = await loadWorkspaceMemories(input.workspaceId);
  const existingBlock = existing.length
    ? existing
        .map((m) => `[${m.kind}] ${m.title}: ${m.body.slice(0, 200)}`)
        .join("\n")
    : "(빈 워크스페이스)";

  const system = `당신은 한국 D2C 브랜드의 워크스페이스 메모리를 큐레이션하는 비즈니스 분석가입니다.
업로드된 PDF (시뮬레이션 리포트·시장조사·컨설팅 자료·사업계획서 등)에서 워크스페이스 메모리에 추가할 가치 있는 인사이트를 추출하세요.

== 추출 기준 ==
- **fact**: 검증 가능한 정량/정성 사실 (예: "메이트 미국 권장가 $140", "올버즈 vs 르무통 가격 격차 50%")
- **context**: 시장·환경·페르소나 컨텍스트 (예: "미국 컴포트 슈즈 시장 100% Multi-LLM 합의 STRONG")
- **decision**: 의사결정 항목 (예: "Nordstrom/Zappos 입점 협상 2026 Q3 착수")
- **preference**: 임원/조직의 선호 (예: "이사회는 PR 시딩 전략 우선 — Wirecutter·Reddit AMA")

== 품질 규칙 ==
- 각 메모리는 title 한 줄 (≤60자) + body 1~3문장 (≤300자).
- title은 키워드 검색이 가능한 형태 (예: "메이트 미국 권장가" O, "권장 가격 정보" X).
- 일반론·교과서적 설명은 추출 금지 (예: "마케팅이 중요하다" X).
- 동일 사실의 중복 → 가장 구체적인 버전만.
- **기존 메모리와 중복**되는 인사이트는 duplicate=true로 표시 (저장 안 됨, 검토 참고용).
- rationale: 왜 이 인사이트가 기억할 가치 있는지 1문장.

== 추출 갯수 ==
PDF 크기·정보 밀도에 따라 5~25개. PDF가 짧으면 적게, 길면 많게.

응답은 반드시 유효한 JSON 한 객체로, 외부 텍스트·코드펜스 없이.`;

  const userPrompt = `${input.hint ? `사용자 힌트: ${input.hint}\n\n` : ""}== 기존 워크스페이스 메모리 (중복 판별용) ==
${existingBlock}

== 응답 JSON 스키마 ==
{
  "candidates": [
    {
      "kind": "fact",
      "title": "...",
      "body": "...",
      "rationale": "...",
      "duplicate": false
    }
  ]
}

위 PDF를 분석해 메모리 후보를 추출하세요.`;

  const client = new Anthropic({ apiKey });
  // Use streaming. The non-streaming `client.messages.create()` path
  // refuses requests whose worst-case generation time exceeds 10 min,
  // and our max_tokens=24000 on a 15+ page PDF crosses that threshold
  // (Anthropic SDK error: "Streaming is required for operations that
  // may take longer than 10 minutes"). Streaming accumulates the
  // response chunk-by-chunk so the SDK keeps the connection open
  // for the full generation regardless of duration. Final cost +
  // token count come from the `message_delta` events at the end.
  let raw = "";
  let inputTokens = 0;
  let outputTokens = 0;
  const stream = client.messages.stream({
    model: MODEL,
    // 24000 token cap covers the longest detailed/validation PDFs
    // (~30 pages, 25+ candidates). Input tokens dominate billing on
    // PDF reads, so the output cap doesn't materially change cost.
    max_tokens: 24000,
    system,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: input.pdfBase64,
            },
          },
          { type: "text", text: userPrompt },
        ],
      },
    ],
  });
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      raw += event.delta.text;
    } else if (event.type === "message_start") {
      inputTokens = event.message.usage?.input_tokens ?? 0;
      outputTokens = event.message.usage?.output_tokens ?? 0;
    } else if (event.type === "message_delta") {
      // Final usage tally — message_delta carries the updated
      // output_tokens count as streaming finishes.
      outputTokens = event.usage?.output_tokens ?? outputTokens;
    }
  }
  if (!raw) throw new Error("empty extractor response");

  const parsed = parseJsonLoose(raw);
  const candidates = normalizeCandidates(parsed);

  // Cost estimate: Sonnet 4.6 = $3/M input + $15/M output. inputTokens
  // + outputTokens populated from message_start / message_delta events
  // in the streaming loop above.
  const costEstimateUsd =
    Math.round(((inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15) * 1000) / 1000;

  // Manual usage log — this module uses the Anthropic SDK directly
  // (not getLLMProvider) because it needs native PDF document input,
  // so the ALS-based wrapper doesn't run automatically. Fire-and-
  // forget insert; failure is logged but never blocks the response.
  try {
    const admin = createServiceClient();
    void admin
      .from("llm_usage_log")
      .insert({
        workspace_id: input.workspaceId,
        provider: "anthropic",
        model: MODEL,
        stage: "mrai-pdf-extract",
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: costEstimateUsd,
        context: { filename: input.filename },
      })
      .then((res: { error: { message: string } | null }) => {
        if (res.error) {
          console.warn("[pdf-memory-extractor] usage log failed:", res.error.message);
        }
      });
  } catch (err) {
    console.warn("[pdf-memory-extractor] usage log build failed:", err);
  }

  return {
    candidates,
    costEstimateUsd,
  };
}

function parseJsonLoose(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // Fast path — well-formed JSON.
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try the legacy "outermost braces" extraction (handles wrapper
    // text the LLM occasionally adds despite the system prompt).
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        // fall through to truncation recovery
      }
    }
  }

  // Truncation recovery — when max_tokens trips the response, the
  // output ends mid-candidate. Recover the last complete candidate by
  // tracking brace depth INSIDE the candidates array, then close the
  // array + outer object manually so JSON.parse succeeds.
  //
  // We look for `"candidates": [` (whitespace-tolerant) as the anchor,
  // then walk forward counting `{` / `}` while ignoring braces inside
  // string literals + escaped chars. Every time depth drops to 0 we
  // record the position — that's the end of a complete candidate. On
  // failure (truncated), we truncate at the last good position and
  // emit `]}` to close.
  const anchorMatch = cleaned.match(/"candidates"\s*:\s*\[/);
  if (!anchorMatch) throw new Error("extractor returned non-JSON (no candidates anchor)");
  const arrayStart = anchorMatch.index! + anchorMatch[0].length;
  let depth = 0;
  let inString = false;
  let escape = false;
  let lastCompleteEnd = arrayStart; // position right after last "}," / "}"
  for (let i = arrayStart; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        lastCompleteEnd = i + 1;
      }
    }
  }
  if (lastCompleteEnd === arrayStart) {
    throw new Error("extractor returned no complete candidates (response too truncated)");
  }
  const recovered = cleaned.slice(0, lastCompleteEnd) + "]}";
  console.warn(
    `[pdf-memory-extractor] JSON truncation recovered — using ${lastCompleteEnd}/${cleaned.length} chars`,
  );
  return JSON.parse(recovered);
}

const VALID_KINDS = new Set<MemoryKind>(["fact", "preference", "context", "decision"]);

function normalizeCandidates(raw: unknown): ExtractedMemoryCandidate[] {
  const obj = raw as { candidates?: unknown };
  const arr = Array.isArray(obj?.candidates) ? obj.candidates : [];
  const out: ExtractedMemoryCandidate[] = [];
  for (const item of arr) {
    const c = item as Partial<ExtractedMemoryCandidate> | null;
    if (!c) continue;
    const kind = (VALID_KINDS.has(c.kind as MemoryKind) ? c.kind : "fact") as MemoryKind;
    const title = (c.title ?? "").toString().slice(0, 120);
    const body = (c.body ?? "").toString().slice(0, 1000);
    if (!title || !body) continue;
    out.push({
      kind,
      title,
      body,
      rationale: (c.rationale ?? "").toString().slice(0, 300),
      duplicate: c.duplicate === true,
    });
  }
  return out;
}
