import OpenAI from "openai";
import type { LLMProvider, LLMRequest, LLMResponse } from "./types";
import { withLLMRetry } from "./retry";
import { hitLengthCap, salvageJsonResponse } from "./json-salvage";

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

    // GPT-5 series and the o-series reasoning models renamed `max_tokens`
    // → `max_completion_tokens` and dropped support for the old parameter.
    // The 400 "Unsupported parameter" error blocks every sim that uses
    // gpt-5.4-mini, so this branch matters at the prefix level. Legacy
    // 4.x models still expect `max_tokens` and reject the new name.
    const isModernOutputLimit =
      this.model.startsWith("gpt-5") ||
      this.model.startsWith("o1") ||
      this.model.startsWith("o3") ||
      this.model.startsWith("o4");
    const tokensCap = req.maxTokens ?? 4096;
    const tokenParam = isModernOutputLimit
      ? { max_completion_tokens: tokensCap }
      : { max_tokens: tokensCap };

    const callOnce = (temperature: number) =>
      withLLMRetry(
      () =>
        this.client.chat.completions.create(
          {
            model: this.model,
            temperature,
            ...tokenParam,
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

    const response = await callOnce(req.temperature ?? 0.7);
    const read = (r: typeof response) => ({
      text: r.choices[0]?.message?.content ?? "",
      truncated: hitLengthCap(r.choices[0]?.finish_reason),
      outputTokens: r.usage?.completion_tokens ?? 0,
    });

    const salvaged = await salvageJsonResponse({
      provider: "openai",
      wantsJson,
      maxTokens: tokensCap,
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

