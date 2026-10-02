/**
 * DeepSeek provider — OpenAI-compatible REST API at https://api.deepseek.com/v1.
 * Same chat-completions surface as OpenAI, so we reuse the OpenAI SDK
 * and just swap baseURL + apiKey. Wired in as the third LLM in the
 * Consensus Plus tier 5/5/5 round-robin after xAI Grok kept timing out
 * on persona batches (Grok-4 reasoning overran the timeout, Grok-3
 * was too slow under concurrent load, Grok-3-mini also timed out).
 *
 * deepseek-chat (V3) is the non-reasoning, fast workhorse — \$0.27 in
 * / \$1.10 out per 1M tok, much cheaper than Sonnet but with strong
 * structured-output reliability. deepseek-reasoner (R1) exists for
 * reasoning workloads but isn't the default for our persona-batch
 * use case.
 */

import OpenAI from "openai";
import type { LLMProvider, LLMRequest, LLMResponse } from "./types";
import { withLLMRetry } from "./retry";
import { hitLengthCap, salvageJsonResponse } from "./json-salvage";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
// Same 180s window we settled on for xAI — gives the slow tail room
// without pinning a sim slot indefinitely. withLLMRetry rotates 5
// attempts before giving up.
const DEEPSEEK_REQUEST_TIMEOUT_MS = 180_000;

export class DeepSeekProvider implements LLMProvider {
  readonly name = "deepseek" as const;
  readonly model: string;
  private client: OpenAI;

  constructor(model: string = "deepseek-chat") {
    this.model = model;
    this.client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: DEEPSEEK_BASE_URL,
      timeout: DEEPSEEK_REQUEST_TIMEOUT_MS,
    });
  }

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const wantsJson = !!req.jsonSchema;

    const maxTokens = req.maxTokens ?? 4096;
    const callOnce = (temperature: number) =>
      withLLMRetry(
      () =>
        this.client.chat.completions.create(
          {
            model: this.model,
            temperature,
            max_tokens: maxTokens,
            // DeepSeek supports OpenAI-style JSON mode via response_format.
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
          },
          // OpenAI-compatible — second arg accepts signal for abort.
          req.signal ? { signal: req.signal } : undefined,
        ),
      { provider: "deepseek", signal: req.signal },
    );

    const response = await callOnce(req.temperature ?? 0.7);
    const read = (r: typeof response) => ({
      text: r.choices[0]?.message?.content ?? "",
      truncated: hitLengthCap(r.choices[0]?.finish_reason),
      outputTokens: r.usage?.completion_tokens ?? 0,
    });

    const salvaged = await salvageJsonResponse({
      provider: "deepseek",
      wantsJson,
      maxTokens,
      arrayKey: req.expectedArrayKey,
      aborted: req.signal?.aborted,
      first: read(response),
      resample: async () => read(await callOnce(0.2)),
    });

    return {
      text: salvaged.text,
      json: salvaged.json,
      usage: {
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: salvaged.outputTokens,
      },
      raw: response,
    };
  }
}
