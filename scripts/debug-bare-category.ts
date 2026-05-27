/**
 * Test the BARE-CATEGORY query (no "추천 / best" framing) — the kind
 * of search the user actually did manually that surfaced 르무통.
 */
import fs from "fs";

function loadEnv() {
  if (process.env.ANTHROPIC_API_KEY) return;
  const raw = fs.readFileSync(".env.local", "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
    }
  }
}
loadEnv();

const QUERIES = [
  "메리노 울 컴포트 스니커즈",
  "메리노 울 컴포트 스니커즈는?",
  "한국 메리노 울 컴포트 스니커즈",
];

const BRAND_VARIANTS = ["르무통", "Le Mouton", "LeMouton", "lemouton"];

function mentionsBrand(text: string): string | null {
  const lower = text.toLowerCase();
  for (const v of BRAND_VARIANTS) {
    const i = lower.indexOf(v.toLowerCase());
    if (i >= 0) return text.slice(i, i + v.length);
  }
  return null;
}

async function probeClaude(q: string): Promise<string> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const c = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const r = await c.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system:
      "You are an AI assistant for consumers in Korea. Be informative and concrete.",
    messages: [{ role: "user", content: q }],
  });
  return r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

async function probeGPT(q: string): Promise<string> {
  const OpenAI = (await import("openai")).default;
  const c = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const r = await c.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1500,
    messages: [
      {
        role: "system",
        content: "You are an AI assistant for consumers in Korea. Be informative and concrete.",
      },
      { role: "user", content: q },
    ],
  });
  return r.choices[0]?.message?.content ?? "";
}

async function probeGemini(q: string): Promise<string> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY!;
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: "You are an AI assistant for consumers in Korea. Be informative and concrete." }],
        },
        contents: [{ role: "user", parts: [{ text: q }] }],
      }),
    },
  );
  const j = (await r.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

async function main() {
  console.log(`Testing ${QUERIES.length} bare-category queries × 3 LLMs\n`);
  for (const q of QUERIES) {
    console.log(`\n=========================`);
    console.log(`QUERY: ${q}`);
    console.log(`=========================`);
    for (const [name, fn] of [
      ["Claude", probeClaude],
      ["ChatGPT", probeGPT],
      ["Gemini", probeGemini],
    ] as const) {
      try {
        const text = await fn(q);
        const found = mentionsBrand(text);
        const mark = found ? `✓ FOUND "${found}"` : `✗ not mentioned`;
        console.log(`\n${name}: ${mark}`);
        if (found) {
          // Show 200 chars around the mention
          const idx = text.toLowerCase().indexOf(found.toLowerCase());
          console.log(
            `Context: ...${text.slice(Math.max(0, idx - 80), idx + 220)}...`,
          );
        }
      } catch (e) {
        console.log(`${name}: ERROR ${e instanceof Error ? e.message : e}`);
      }
    }
  }
}

main().catch(console.error);
