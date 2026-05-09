import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, LLMRequest, LLMResponse } from "./types";
import { withLLMRetry } from "./retry";
import { recoverJsonFromText } from "./json-parse";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic" as const;
  readonly model: string;
  private client: Anthropic;

  constructor(model: string = "claude-sonnet-4-6") {
    this.model = model;
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const wantsJson = !!req.jsonSchema;
    const systemSuffix = wantsJson
      ? "\n\nRespond with a single JSON object that strictly matches the provided schema. Do not wrap in markdown code fences."
      : "";

    const promptText = wantsJson
      ? `${req.prompt}\n\nJSON schema:\n${JSON.stringify(req.jsonSchema)}`
      : req.prompt;

    // When images are supplied, build a multi-block content array — text
    // first so the model has the framing before it sees the visuals.
    //
    // Two image source forms are supported:
    //  - `imagesInline` (preferred): caller pre-fetched bytes and passes
    //    base64. Anthropic decodes inline; no provider-side fetch.
    //  - `images` (URL): Anthropic's backend fetches the URL on receipt.
    //    Times out at ~5s if the URL is slow → HTTP 400 with
    //    `x-should-retry: false`. Use only when you can't pre-fetch.
    //
    // Concatenated when both are set: inline first (already in memory),
    // URLs after.
    const inlineBlocks =
      req.imagesInline?.map((img) => ({
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: img.mediaType as
            | "image/jpeg"
            | "image/png"
            | "image/gif"
            | "image/webp",
          data: img.base64,
        },
      })) ?? [];
    const urlBlocks =
      req.images?.map((url) => ({
        type: "image" as const,
        source: { type: "url" as const, url },
      })) ?? [];
    const imageBlocks = [...inlineBlocks, ...urlBlocks];
    const userContent: Anthropic.MessageParam["content"] =
      imageBlocks.length > 0
        ? [{ type: "text", text: promptText }, ...imageBlocks]
        : promptText;

    const response = await withLLMRetry(
      () =>
        this.client.messages.create(
          {
            model: this.model,
            max_tokens: req.maxTokens ?? 4096,
            temperature: req.temperature ?? 0.7,
            system: (req.system ?? "") + systemSuffix,
            messages: [{ role: "user", content: userContent }],
          },
          // Anthropic SDK forwards signal to the underlying fetch call,
          // so a user cancellation aborts the in-flight HTTP request
          // immediately instead of waiting for the response to complete.
          req.signal ? { signal: req.signal } : undefined,
        ),
      { provider: "anthropic", signal: req.signal },
    );

    const text = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");

    const truncated = response.stop_reason === "max_tokens";
    const json = wantsJson
      ? recoverJsonFromText(text, { arrayKey: req.expectedArrayKey })
      : undefined;

    // Surface output-cap truncation. When stop_reason == "max_tokens" and
    // we couldn't recover ANY usable JSON, throw — that triggers the
    // failover wrapper's retry-on-different-provider behavior. When we
    // DID recover partial JSON (most common case post-2026-05-10
    // partial-array-recovery utility), keep the response but log so the
    // operator sees the data partial-loss in monitoring.
    if (truncated) {
      const usedTokens = response.usage.output_tokens;
      if (wantsJson && json === undefined) {
        // Hard failure — throw to let the failover wrapper try a
        // different provider. Without this throw, the caller sees an
        // empty result and drops the whole batch.
        throw new Error(
          `Anthropic response truncated at max_tokens=${req.maxTokens ?? 4096} (used ${usedTokens}) — JSON unrecoverable, request retry/failover`,
        );
      }
      console.warn(
        `[anthropic] response hit max_tokens=${req.maxTokens ?? 4096} ceiling — output truncated. ` +
          `Used ${usedTokens} tokens. Partial JSON recovered (caller may see incomplete array).`,
      );
    }

    return {
      text,
      json,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      raw: response,
    };
  }
}
