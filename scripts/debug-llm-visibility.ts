/**
 * Diagnostic: runs one brand-eliciting query against each LLM and
 * shows the raw response + analyzer output. Bypasses Next.js so we
 * can confirm what's actually happening when the UI says 0%.
 *
 * Run: DOTENV_PATH=.env.local npx tsx scripts/debug-llm-visibility.ts
 */
import fs from "fs";

function loadEnv() {
  if (process.env.ANTHROPIC_API_KEY) return;
  try {
    const raw = fs.readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
      }
    }
  } catch {}
}
loadEnv();

async function probeClaude(query: string) {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const resp = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system:
      "You are an AI shopping assistant for consumers in Korea (South Korea) " +
      "(market code: KR). When asked about products, recommend 4-6 SPECIFIC REAL BRANDS " +
      "that consumers in Korea can actually buy today. REQUIRED: include local/native " +
      "brands of Korea alongside global brands — do not skip local brands even if " +
      "they're smaller. List with one-line descriptions. Be concrete.",
    messages: [{ role: "user", content: query }],
  });
  return resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
}

async function probeGPT(query: string) {
  if (!process.env.OPENAI_API_KEY) return "(OPENAI_API_KEY missing)";
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const resp = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 800,
    messages: [
      {
        role: "system",
        content:
          "You are an AI shopping assistant for consumers in Korea (South Korea) " +
          "(market code: KR). REQUIRED: include local/native Korean brands when " +
          "answering. Be concrete with 4-6 brand names.",
      },
      { role: "user", content: query },
    ],
  });
  return resp.choices[0]?.message?.content ?? "(empty)";
}

async function probeGemini(query: string) {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    process.env.GOOGLE_API_KEY ??
    process.env.GEMINI_API_KEY;
  if (!apiKey) return "(no Google API key)";
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text:
                "You are an AI shopping assistant for consumers in Korea (South Korea). " +
                "REQUIRED: include local/native Korean brands. List 4-6 brand names.",
            },
          ],
        },
        contents: [{ role: "user", parts: [{ text: query }] }],
      }),
    },
  );
  if (!r.ok) {
    const body = await r.text();
    return `(gemini HTTP ${r.status}: ${body.slice(0, 200)})`;
  }
  const j = await r.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "(empty)";
}

function checkBrand(text: string, brand: string): boolean {
  const lower = text.toLowerCase();
  for (const v of [brand, "Le Mouton", "LeMouton", "lemouton", "le mouton", "Le-Mouton"]) {
    if (lower.includes(v.toLowerCase())) return true;
  }
  return false;
}

async function main() {
  console.log("ENV check:");
  console.log("  ANTHROPIC_API_KEY:", process.env.ANTHROPIC_API_KEY ? "✓" : "✗");
  console.log("  OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "✓" : "✗");
  console.log(
    "  GOOGLE_GENERATIVE_AI_API_KEY:",
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ? "✓" : "✗",
  );
  console.log("");

  const queries = [
    "한국에서 가장 추천하는 메리노 울 컴포트 스니커즈 브랜드는?",
    "발 편한 운동화 브랜드 한국에서 어디서 사야 좋아?",
    "메리노 울 스니커즈 추천 한국 브랜드",
  ];

  const brand = "르무통";
  for (const q of queries) {
    console.log(`\n========================`);
    console.log(`QUERY: ${q}`);
    console.log(`========================`);
    for (const [name, fn] of [
      ["Claude", probeClaude],
      ["ChatGPT", probeGPT],
      ["Gemini", probeGemini],
    ] as const) {
      try {
        const t0 = Date.now();
        const text = await fn(q);
        const mentioned = checkBrand(text, brand);
        console.log(`\n--- ${name} (${Date.now() - t0}ms, mentioned=${mentioned}) ---`);
        console.log(text.slice(0, 1500));
      } catch (e) {
        console.log(`\n--- ${name} ERROR ---`);
        console.log(e instanceof Error ? e.message : String(e));
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
