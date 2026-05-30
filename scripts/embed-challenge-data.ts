/**
 * Embed challenge reference data — 판판대로 programs/products + 수출바우처
 * programs. Phase B 추천 모델 stage 1 (cosine similarity) 의 핵심 사전 작업.
 *
 * 한번만 실행 (또는 ingestion 추가분만 미임베딩 row 대상 재실행).
 * 비용: OpenAI text-embedding-3-small ~$0.02 / 1M tokens.
 *   - 90 programs × ~500 tok = 45k tok = $0.001
 *   - 5.8만 voucher × ~500 tok = 29M tok = $0.58
 *   - 7만 products × ~200 tok = 14M tok = $0.28
 *   - 합계 ~$0.86. 데이터셋 전체 평생 비용.
 *
 * Usage:
 *   npm run embed:challenge -- pp-programs
 *   npm run embed:challenge -- voucher-programs
 *   npm run embed:challenge -- pp-products
 *   npm run embed:challenge -- all                      # 위 세 가지 순차
 *
 * Idempotent — embedding IS NULL인 row만 처리.
 */

import { Client } from "pg";

const BATCH_SIZE = 100;
const EMBED_MODEL = "text-embedding-3-small";

type Mode = "pp-programs" | "voucher-programs" | "pp-products" | "all";

async function embedBatch(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  const inputs = texts.map((t) => (t.trim() ? t : " "));
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`embed ${res.status}: ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    data: Array<{ embedding: number[]; index: number }>;
  };
  return [...json.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

interface EmbedJob {
  table: string;
  selectCols: string;
  buildText: (row: Record<string, unknown>) => string;
}

const JOBS: Record<Exclude<Mode, "all">, EmbedJob> = {
  "pp-programs": {
    table: "ch_pp_programs",
    selectCols:
      "id, program_name, program_purpose, eligibility, support_content, organization",
    buildText: (r) =>
      [
        r.program_name,
        r.program_purpose,
        r.eligibility,
        r.support_content,
        r.organization && `(${r.organization})`,
      ]
        .filter(Boolean)
        .join(". "),
  },
  "voucher-programs": {
    table: "ch_voucher_programs",
    selectCols:
      "id, program_name, eligibility, support_content, selection_criteria, organization",
    buildText: (r) =>
      [
        r.program_name,
        r.eligibility,
        r.support_content,
        r.selection_criteria,
        r.organization && `(${r.organization})`,
      ]
        .filter(Boolean)
        .join(". "),
  },
  "pp-products": {
    table: "ch_pp_products",
    selectCols: "id, product_name, category, description",
    buildText: (r) =>
      [r.product_name, r.category && `[${r.category}]`, r.description]
        .filter(Boolean)
        .join(". "),
  },
};

async function runJob(client: Client, mode: Exclude<Mode, "all">): Promise<void> {
  const job = JOBS[mode];
  console.log(`\n=== ${mode} (${job.table}) ===`);
  const { rows: countRows } = await client.query<{ n: string }>(
    `SELECT count(*) as n FROM ${job.table} WHERE embedding IS NULL`,
  );
  const remaining = parseInt(countRows[0].n, 10);
  console.log(`  ${remaining} rows pending`);

  if (remaining === 0) return;

  let processed = 0;
  while (true) {
    const { rows } = await client.query(
      `SELECT ${job.selectCols} FROM ${job.table} WHERE embedding IS NULL LIMIT ${BATCH_SIZE}`,
    );
    if (rows.length === 0) break;

    const texts = rows.map((r) => job.buildText(r));
    const vectors = await embedBatch(texts);

    for (let i = 0; i < rows.length; i++) {
      const id = rows[i].id;
      const literal = `[${vectors[i].join(",")}]`;
      await client.query(`UPDATE ${job.table} SET embedding = $1::vector WHERE id = $2`, [
        literal,
        id,
      ]);
    }
    processed += rows.length;
    console.log(`  embedded ${processed} / ${remaining}`);
  }
  console.log(`  ✓ done (${processed})`);
}

async function main() {
  const mode = (process.argv[2] as Mode) ?? "all";
  if (!["pp-programs", "voucher-programs", "pp-products", "all"].includes(mode)) {
    console.error(`unknown mode: ${mode}`);
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY required");
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    if (mode === "all") {
      for (const m of ["pp-programs", "voucher-programs", "pp-products"] as const) {
        await runJob(client, m);
      }
    } else {
      await runJob(client, mode as Exclude<Mode, "all">);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
