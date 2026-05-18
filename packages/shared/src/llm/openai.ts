import OpenAI from "openai";
import type { LLMProvider, LLMRequest, LLMResponse } from "./types";
import { withLLMRetry } from "./retry";
import { recoverJsonFromText } from "./json-parse";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai" as const;
  readonly model: string;
  private client: OpenAI;

  constructor(model: string = "gpt-5.4-mini") {
    this.model = model;
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const wantsJson = !!req.jsonSchema;

    const response = await withLLMRetry(
      () =>
        this.client.chat.completions.create(
          {
            model: this.model,
            temperature: req.temperature ?? 0.7,
            max_tokens: req.maxTokens ?? 4096,
            response_format: wantsJson ? { type: "json_object" } : undefined,
            messages: [
              ...(req.system ? [{ role: "system" as const, content: req.system }] : []),
              {
                role: "user",
                content: wantsJson
                  ? `${req.prompt}\n\nReturn JSON matching this schema:\n${JSON.stringify(req.jsonSchema)}`
                  : req.prompt,
              },
            ],
          },
          // OpenAI SDK accepts signal in the second-arg request options
          // so cancel aborts the in-flight HTTP call immediately.
          req.signal ? { signal: req.signal } : undefined,
        ),
      { provider: "openai", signal: req.signal },
    );

    const text = response.choices[0]?.message?.content ?? "";

    return {
      text,
      json: wantsJson
        ? recoverJsonFromText(text, { arrayKey: req.expectedArrayKey })
        : undefined,
      usage: {
        inputTokens: response.usage?.prompt_tokens,
        outputTokens: response.usage?.completion_tokens,
      },
      raw: response,
    };
  }
}

