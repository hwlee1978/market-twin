/**
 * Reveal what queries the audit's Haiku generator ACTUALLY produces,
 * then probe each LLM with them and show full response text. So we
 * can compare against the user's manually-successful queries.
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

async function generateQueries(locale: "ko" | "en", count: number) {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const c = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const system =
    `Generate ${count} natural questions a consumer might ask an AI assistant ` +
    "when looking for products in a category — EXPLICITLY ELICIT BRAND RECOMMENDATIONS.\n" +
    `Output JSON: { "queries": [...] }. Write strictly in ${locale === "ko" ? "Korean" : "English"}. ` +
    "Mix angles: broad ('best X'), use-case, price-tier, buying. " +
    "Don't mention specific brands.";
  const r = await c.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    system,
    messages: [
      {
        role: "user",
        content: `Category: 메리노 울 컴포트 스니커즈\nMarket: KR\nLanguage: ${locale === "ko" ? "Korean" : "English"}`,
      },
    ],
  });
  const text = r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return [];
  return (JSON.parse(m[0]) as { queries?: string[] }).queries ?? [];
}

async function main() {
  const koQ = await generateQueries("ko", 3);
  const enQ = await generateQueries("en", 3);
  console.log("=== Korean queries (3) ===");
  koQ.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));
  console.log("\n=== English queries (3) ===");
  enQ.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));
}

main().catch(console.error);
