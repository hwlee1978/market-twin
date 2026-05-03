import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LLMProvider, LLMRequest, LLMResponse } from "./types";
import { withLLMRetry } from "./retry";

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini" as const;
  readonly model: string;
  private client: GoogleGenerativeAI;

  constructor(model: string = "gemini-2.5-flash") {
    this.model = model;
    this.client = new GoogleGenerativeAI(
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "",
    );
  }

  async generate(req: LLMRequest): Promise<LLMResponse> {
    const wantsJson = !!req.jsonSchema;
    const model = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: req.system,
      generationConfig: {
        temperature: req.temperature ?? 0.7,
        maxOutputTokens: req.maxTokens ?? 4096,
        responseMimeType: wantsJson ? "application/json" : "text/plain",
      },
    });

    const result = await withLLMRetry(
      () =>
        model.generateContent(
          wantsJson
            ? `${req.prompt}\n\nJSON schema (return JSON only):\n${JSON.stringify(req.jsonSchema)}`
            : req.prompt,
        ),
      { provider: "gemini" },
    );

    const text = result.response.text();
    const usage = result.response.usageMetadata;

    return {
      text,
      json: wantsJson ? safeParseJson(text) : undefined,
      usage: {
        inputTokens: usage?.promptTokenCount,
        outputTokens: usage?.candidatesTokenCount,
      },
      raw: result.response,
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
