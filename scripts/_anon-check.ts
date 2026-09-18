/** 익명화 누수 점검 — 브랜드 고유명사가 익명화본에 남았는지만 본다(LLM 19콜). */
import { Client } from "pg";
import { getLLMProvider } from "../packages/shared/src/llm";
const NAMES = ["Medicube Zero Pore Pad","Kundal Perfume Shampoo","Five Guys burgers","shiro natural cosmetics",
 "Meet More fruit instant coffee","Wardah halal cosmetics","Yopokki Instant Tteokbokki","Jinro Soju",
 "Kleannara Pure Cotton Sanitary Pads","Native Deodorant","Glico Pocky biscuit sticks","Bulk Homme men's skincare",
 "Krating Daeng energy drink","Oishi prawn crackers (Liwayway)","OldTown White Coffee 3-in-1",
 "Anker charging accessories","Tony's Chocolonely chocolate","Shake Shack burgers","Kopiko Brown 3-in-1 Coffee"];
/** 카테고리 일반명사 — 남아 있어도 정체가 드러나지 않는다. */
const GENERIC = new Set(["burgers","cosmetics","coffee","shampoo","skincare","chocolate","crackers","deodorant",
 "accessories","charging","sanitary","pads","instant","drink","energy","white","brown","perfume","natural","fruit",
 "more","meet","pore","zero","halal","men's","biscuit","sticks","prawn","soju"]);
async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const q = await c.query(
    `SELECT DISTINCT ON (p.product_name) p.product_name AS name, p.description
       FROM projects p JOIN ensembles e ON e.project_id=p.id
      WHERE e.status='completed' AND p.product_name = ANY($1::text[])
      ORDER BY p.product_name, p.created_at DESC;`, [NAMES]);
  await c.end();
  const llm = getLLMProvider({ provider: "anthropic" });
  let bad = 0;
  for (const p of q.rows as any[]) {
    const r = await llm.generate({
      system: "You rewrite product briefs to remove identity. Output JSON only.",
      prompt: `Rewrite the brief below so that the specific company or product can NOT be identified.\n` +
        `Remove: brand names, parent companies, founder names, retailer/platform names, app names,\n` +
        `award names, exact founding years, and any uniquely identifying phrase.\n` +
        `Keep: category, price tier, product form, positioning, ingredients/features, channel TYPE\n` +
        `(e.g. "a major domestic e-commerce marketplace"), and market position in generic terms.\n` +
        `Do not add facts. Keep it similar in length.\n\nBRIEF:\n${p.description}\n\n` +
        `Return JSON: {"anon": "..."}`,
      temperature: 0, maxTokens: 1200,
    });
    const m = r.text.match(/\{[\s\S]*\}/);
    const anon = m ? (JSON.parse(m[0]).anon ?? "") : "";
    const toks = p.name.split(/[\s(),']+/).filter((t: string) => t.length >= 4 && !/^\d+$/.test(t));
    const leaked = toks.filter((t: string) => anon.toLowerCase().includes(t.toLowerCase()));
    const proper = leaked.filter((t: string) => !GENERIC.has(t.toLowerCase()));
    if (proper.length) bad++;
    console.log(`${p.name.padEnd(38)} 누수토큰=[${leaked.join(",")}] 고유명사=[${proper.join(",")}]`);
  }
  console.log(`\n고유명사가 남은 픽스처: ${bad}/${q.rowCount}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
