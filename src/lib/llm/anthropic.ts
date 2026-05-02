import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, LLMRequest, LLMResponse } from "./types";

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
    // first so the model has the framing before it sees the visuals. URLs
    // must be publicly fetchable; Anthropic returns 400 if it can't load,
    // which surfaces back to the caller as a normal error.
    const userContent: Anthropic.MessageParam["content"] =
      req.images && req.images.length > 0
        ? [
            { type: "text", text: promptText },
            ...req.images.map((url) => ({
              type: "image" as const,
              source: { type: "url" as const, url },
            })),
          ]
        : promptText;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.7,
      system: (req.system ?? "") + systemSuffix,
      messages: [{ role: "user", content: userContent }],
    });

    const text = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");

    return {
      text,
      json: wantsJson ? safeParseJson(text) : undefined,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      raw: response,
    };
  }
}

function safeParseJson(text: string): unknown {
  // Trim common wrappers in case the model still ignored the instruction.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Last-resort: extract the first {...} block.
    const match = cleaned.match(/\{[\s\S]*\}/);
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
