/**
 * OpenAI text embeddings for Mr. AI persistent memory.
 *
 * Single provider (OpenAI text-embedding-3-small, 1536 dims) — cheap,
 * fast, and good enough for our scale. Voyage/Cohere are slightly
 * better on semantic retrieval but we'd lose the simplicity of one
 * key shared with other parts of the codebase.
 *
 * Cost ballpark: ~$0.02 per 1M tokens. A workspace with 1000 memories
 * averaging 100 tokens each = 100K tokens = $0.002 to embed everything.
 * Per-chat-turn embed of the user's question is another ~10-100 tokens.
 * Negligible vs LLM generation cost.
 */

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMS = 1536;

export const MEMORY_EMBEDDING_DIMS = EMBEDDING_DIMS;

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage: { prompt_tokens: number; total_tokens: number };
}

/**
 * Embed a batch of texts. Returns embeddings in the same order. Throws
 * on API error so the caller decides whether to fall back to keyword
 * mode or surface the failure.
 *
 * Empty input strings get replaced with " " (single space) before
 * sending — OpenAI rejects fully empty strings inside a batch.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const inputs = texts.map((t) => (t.trim() ? t : " "));

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: inputs,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`embed ${res.status}: ${detail.slice(0, 200)}`);
  }

  const json = (await res.json()) as OpenAIEmbeddingResponse;
  if (!json.data || json.data.length !== inputs.length) {
    throw new Error(`embed: expected ${inputs.length} embeddings, got ${json.data?.length ?? 0}`);
  }

  // OpenAI returns out of order in batch; sort by index to match input order.
  const sorted = [...json.data].sort((a, b) => a.index - b.index);
  return sorted.map((d) => d.embedding);
}

export async function embedSingle(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v;
}
