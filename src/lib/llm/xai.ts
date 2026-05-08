/**
 * xAI Grok provider — OpenAI-compatible REST API at https://api.x.ai/v1.
 * Same chat-completions surface as OpenAI, so we reuse the OpenAI SDK
 * and just swap baseURL + apiKey.
 *
 * Wired in 2026-05-08 to replace Gemini's slot in the Consensus+ tier
 * round-robin after Gemini sims were shipping 60-96 personas (vs the
 * 200 target) — partial responses + 503s on the persona batch endpoint.
 * Grok-4 lands in the same price tier as Sonnet ($3 in / $15 out per 1M)
 * but actually returns full batches.
 */

import OpenAI from "openai";
import type { LLMProvider, LLMRequest, LLMResponse } from "./types";
import { withLLMRetry } from "./retry";

const XAI_BASE_URL = "https://api.x.ai/v1";

// Per-request timeout (ms). Default OpenAI SDK timeout is 10 min, which
// is way too generous for our use case — a hung xAI call would block a
// sim slot for the full duration. Grok-3 was hitting our prior 90s cap
// repeatedly under load (KR→US-east latency + xAI infra), so 180s gives
// the slow tail more room while still letting withLLMRetry rotate
// through up to 5 attempts before giving up.
const XAI_REQUEST_TIMEOUT_MS = 180_000;

export class XaiProvider implements LLMProvider {
  readonly name = "xai" as const;
  readonly model: string;
  private client: OpenAI;

  constructor(model: string = "grok-3-mini") {
    // Default "grok-3-mini": full Grok-3 was timing out repeatedly on
    // 12-persona batches (probably backend slowness, not reasoning
    // overhead). Grok-3-mini is the smaller / faster sibling — runs in
    // 5-15s typical vs 60-90s+ for Grok-3, at $0.30/$0.50 per 1M tok
    // (~10× cheaper than Grok-3). Voice quality drops some but the top-
    // voice filter naturally surfaces Sonnet/GPT-4 voices first; the
    // mini model's contribution is the cross-LLM scoring signal, not
    // headline persona quotes.
    //
    // History: started grok-4 (reasoning, blew past SDK timeout
    // immediately), tried grok-3 (still too slow under concurrent
    // load), settled on grok-3-mini for reliability. Override via
    // LLM_<STAGE>_MODEL=grok-3 / grok-4 if a future stage needs the
    // bigger model.
    this.model = model;
    this.client = new OpenAI({
      apiKey: process.env.XAI_API_KEY,
      baseURL: XAI_BASE_URL,
      timeout: XAI_REQUEST_TIMEOUT_MS,
    });
  }

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const wantsJson = !!req.jsonSchema;

    const response = await withLLMRetry(
      () =>
        this.client.chat.completions.create({
          model: this.model,
          temperature: req.temperature ?? 0.7,
          max_tokens: req.maxTokens ?? 4096,
          // Grok supports OpenAI's response_format JSON mode; if a
          // future model drops it we fall back to prompt-only steering
          // (the JSON-shape line in the user message handles that).
          response_format: wantsJson ? { type: "json_object" } : undefined,
          messages: [
            ...(req.system
              ? [{ role: "system" as const, content: req.system }]
              : []),
            {
              role: "user",
              content: wantsJson
                ? `${req.prompt}\n\nReturn JSON matching this schema:\n${JSON.stringify(req.jsonSchema)}`
                : req.prompt,
            },
          ],
        }),
      { provider: "xai" },
    );

    const text = response.choices[0]?.message?.content ?? "";

    return {
      text,
      json: wantsJson ? safeParseJson(text) : undefined,
      usage: {
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens,
      },
      raw: response,
    };
  }
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}
