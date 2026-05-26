import { getLLMProvider } from "@/lib/llm";
import { extractTitle, fetchUrl, htmlToText, newLinesOnly, sha1 } from "./extract";

/**
 * Fetch a website + extract "what's new" — emits structured memory
 * candidates for self-website OR competitor sources.
 *
 * Returns:
 *   - `noChange: true` when content hash matches the prior snapshot
 *   - `memories: []` when content changed but the LLM extracted no
 *     actionable update (e.g. only nav text changed)
 *   - `memories: [{title, body, kind, importance}]` when real updates
 *     found — caller writes them to mrai_memories.
 */

export type CrawlMemory = {
  title: string;
  body: string;
  kind: "fact" | "context" | "decision";
  importance: number; // 0-100
};

export type WebsiteCrawlResult = {
  noChange: boolean;
  newHash: string;
  newSnapshot: { text: string; title: string | null; ts: string };
  memories: CrawlMemory[];
  inputTokens: number;
  outputTokens: number;
};

const SYSTEM_KO_SELF = `당신은 워크스페이스의 자사 웹사이트를 모니터링하는 분석가입니다.

입력:
- 워크스페이스 브랜드 정보 (간략)
- 자사 웹사이트의 "이전 fetch 이후 새로 등장한 라인들" (HTML→text diff)

작업:
- 새 라인 중 "회사가 알아야 할 변화"만 골라 메모리 항목으로 변환.
- 예: 신상품 출시, 신규 컬렉션, 새 매장 오픈, 보도자료, 채용공고, 가격 변경, 인증 취득, 파트너십.
- 무관 콘텐츠 (단순 navigation, 약관 변경, 쿠키 안내, 푸터 링크, 일반 카피)은 제외.
- 같은 정보가 여러 라인에 나오면 1개로 통합.

출력 JSON: { "memories": [ { "title": "...", "body": "...", "kind": "fact"|"context"|"decision", "importance": 0-100 } ] }

규칙:
- title은 한국어 한 문장 (max 80자).
- body는 1-2문장으로 사실 위주 (max 280자). 추측/마케팅 톤 금지.
- kind: fact (확실한 사실), context (배경/맥락), decision (회사의 결정).
- importance: 핵심 정보 80-100, 흥미로움 50-70, 부수적 30-50.
- 실제 새 정보가 없으면 "memories": [].
- 한국어로 작성.`;

const SYSTEM_KO_COMPETITOR = `당신은 경쟁사 모니터링 분석가입니다.

입력:
- 자사 브랜드 정보 (대조 기준)
- 경쟁사 사이트의 "이전 fetch 이후 새로 등장한 라인들"

작업:
- 자사 전략에 영향 줄 만한 경쟁사 변화만 추출.
- 예: 가격 인상/인하, 신상품, 신규 컬래보레이션, 인증, 매장 확장, 채널 확장.
- 일반 콘텐츠 (제품 설명 복사본, 마케팅 카피, 매장 안내)은 제외.

출력 JSON: { "memories": [ { "title": "...", "body": "...", "kind": "context", "importance": 0-100 } ] }

규칙:
- title은 "[경쟁사명] 변화 요약" 형식으로 한국어 한 문장 (max 80자).
- body는 1-2문장 (max 280자). 자사가 어떻게 대응해야 할지 1줄로 implicit hint 허용.
- 항상 kind="context" — 경쟁사 변화는 우리 회사의 fact가 아님.
- 실제 새 정보가 없으면 "memories": [].`;

export async function crawlWebsite(input: {
  url: string;
  sourceType: "self_website" | "competitor";
  brandContext: string; // workspace brand summary (1-3 paragraphs)
  prevSnapshot: { text: string; title: string | null } | null;
  prevHash: string | null;
}): Promise<WebsiteCrawlResult> {
  const html = await fetchUrl(input.url);
  const text = htmlToText(html);
  const title = extractTitle(html);
  const newHash = sha1(text);
  const newSnapshot = { text, title, ts: new Date().toISOString() };

  if (input.prevHash && input.prevHash === newHash) {
    return { noChange: true, newHash, newSnapshot, memories: [], inputTokens: 0, outputTokens: 0 };
  }

  const diff = input.prevSnapshot
    ? newLinesOnly(input.prevSnapshot.text, text)
    : text.slice(0, 8000); // First fetch — feed top of page

  if (diff.trim().length < 80) {
    // Hash changed but content essentially the same — treat as no-op
    return { noChange: true, newHash, newSnapshot, memories: [], inputTokens: 0, outputTokens: 0 };
  }

  const provider = getLLMProvider({ provider: "anthropic" });
  const system =
    input.sourceType === "self_website" ? SYSTEM_KO_SELF : SYSTEM_KO_COMPETITOR;

  const res = await provider.generate({
    system,
    prompt: `# 워크스페이스 브랜드
${input.brandContext}

# ${input.sourceType === "self_website" ? "자사" : "경쟁사"} 사이트
URL: ${input.url}
${title ? `Title: ${title}\n` : ""}

# 새로 등장한 라인들 (이전 fetch와 diff)
${diff}

위에서 의미 있는 변화만 골라 memories JSON으로 출력하세요.`,
    temperature: 0.2,
    maxTokens: 2000,
    cacheSystem: true,
    jsonSchema: {
      type: "object",
      required: ["memories"],
      properties: {
        memories: {
          type: "array",
          items: {
            type: "object",
            required: ["title", "body", "kind"],
            properties: {
              title: { type: "string", maxLength: 120 },
              body: { type: "string", maxLength: 500 },
              kind: { type: "string", enum: ["fact", "context", "decision"] },
              importance: { type: "number", minimum: 0, maximum: 100 },
            },
          },
          maxItems: 12,
        },
      },
    },
  });

  const raw = (res.json as { memories?: Array<Partial<CrawlMemory>> }) ?? {};
  const memories: CrawlMemory[] = (Array.isArray(raw.memories) ? raw.memories : [])
    .filter((m) => typeof m.title === "string" && typeof m.body === "string")
    .map((m) => ({
      title: (m.title as string).slice(0, 120),
      body: (m.body as string).slice(0, 500),
      kind: (m.kind as "fact" | "context" | "decision") ?? "context",
      importance: typeof m.importance === "number" ? Math.max(0, Math.min(100, m.importance)) : 50,
    }));

  return {
    noChange: false,
    newHash,
    newSnapshot,
    memories,
    inputTokens: res.usage?.inputTokens ?? 0,
    outputTokens: res.usage?.outputTokens ?? 0,
  };
}
