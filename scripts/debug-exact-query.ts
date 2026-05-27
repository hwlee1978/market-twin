/**
 * Run the user's EXACT successful query through my audit's probe
 * pipeline with the new "international audience" system prompt.
 * Should match the user's manual Gemini result.
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

const SYSTEM_EN =
  "You are an AI shopping assistant for an international audience " +
  "interested in products from various regions including Korea (South Korea). " +
  "When asked about products, recommend 4-6 SPECIFIC REAL BRANDS from " +
  "around the world that consumers can actually buy. REQUIRED: if the " +
  "category has notable brands from Korea (South Korea) or other regions, " +
  "mention them explicitly with a \"Worth mentioning from Korea (South Korea)\" " +
  "or similar callout — do not filter them out for being smaller than " +
  "global incumbents. List with one-line descriptions. Be concrete.";

const QUERY = "Which merino wool sneaker brands are recommended for daily commuting?";
const BRAND = "르무통";

function checkBrand(text: string): string | null {
  const variants = [BRAND, "Le Mouton", "LeMouton", "le mouton", "lemouton"];
  const lower = text.toLowerCase();
  for (const v of variants) {
    const i = lower.indexOf(v.toLowerCase());
    if (i >= 0) return text.slice(i, i + v.length);
  }
  return null;
}

async function probeClaude() {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const c = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const r = await c.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: SYSTEM_EN,
    messages: [{ role: "user", content: QUERY }],
  });
  return r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

async function probeGPT() {
  const OpenAI = (await import("openai")).default;
  const c = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const r = await c.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1500,
    messages: [
      { role: "system", content: SYSTEM_EN },
      { role: "user", content: QUERY },
    ],
  });
  return r.choices[0]?.message?.content ?? "";
}

async function probeGemini() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY!;
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_EN }] },
        contents: [{ role: "user", parts: [{ text: QUERY }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1500 },
      }),
    },
  );
  if (!r.ok) return `(HTTP ${r.status}: ${(await r.text()).slice(0, 200)})`;
  const j = (await r.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

async function main() {
  console.log(`Query: "${QUERY}"`);
  console.log(`Brand: ${BRAND}`);
  console.log("");
  for (const [name, fn] of [
    ["Claude", probeClaude],
    ["ChatGPT", probeGPT],
    ["Gemini", probeGemini],
  ] as const) {
    try {
      const t = await fn();
      const found = checkBrand(t);
      console.log(`\n=== ${name} ${found ? `✓ FOUND "${found}"` : "✗ not found"} ===`);
      console.log(t.slice(0, 2000));
    } catch (e) {
      console.log(`\n=== ${name} ERROR ===`);
      console.log(e instanceof Error ? e.message : e);
    }
  }
}

main().catch(console.error);
