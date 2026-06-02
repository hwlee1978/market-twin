/**
 * /api/challenge/recommend 빈 결과 원인 추적 — 로컬 진단 스크립트.
 *
 * Vercel 로그 캡처 대기 대신, 실 운영 DB(.env.local DATABASE_URL)에
 * 동일 입력을 흘려서 어느 단계가 비어 있는지 즉시 가려낸다.
 *
 *   stage 0: ch_pp_programs / ch_voucher_programs 임베딩 적재 여부
 *   stage 1: pgvector RPC 호출 → 후보 N개 반환되는가
 *   stage 2: LLM rerank → ranked[] 가 채워지는가
 *
 * Usage:
 *   npm exec tsx --env-file=.env.local scripts/debug-challenge-recommend.ts
 */
import { createClient } from "@supabase/supabase-js";
import { recommend, hashInput } from "../src/lib/challenge/recommend";

const SAMPLE = {
  company: {
    name: "(주)예시화장품",
    industry: "화장품 제조",
    region: "서울",
    revenue_band: "10-50억",
    employee_band: "5-20명",
  },
  products: [
    {
      name: "비건 쿠션 파운데이션",
      category: "화장품",
      description: "K-뷰티 비건 쿠션",
    },
  ],
  intent: "both" as const,
  goal: "동남아 진출 + ESG 인증",
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
    process.exit(1);
  }
  const svc = createClient(url, serviceKey, { auth: { persistSession: false } });

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Stage 0 — embedding column 적재 상태");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  const ppCountAll = await svc
    .from("ch_pp_programs")
    .select("id", { count: "exact", head: true });
  const ppCountEmbedded = await svc
    .from("ch_pp_programs")
    .select("id", { count: "exact", head: true })
    .not("embedding", "is", null);
  const vchCountAll = await svc
    .from("ch_voucher_programs")
    .select("id", { count: "exact", head: true });
  const vchCountEmbedded = await svc
    .from("ch_voucher_programs")
    .select("id", { count: "exact", head: true })
    .not("embedding", "is", null);

  console.log(
    `  ch_pp_programs:      total=${ppCountAll.count ?? "?"} embedded=${ppCountEmbedded.count ?? "?"}`,
  );
  console.log(
    `  ch_voucher_programs: total=${vchCountAll.count ?? "?"} embedded=${vchCountEmbedded.count ?? "?"}`,
  );

  if ((ppCountEmbedded.count ?? 0) === 0 && (vchCountEmbedded.count ?? 0) === 0) {
    console.log("\n❌ embedding 칼럼 둘 다 비어 있음 → npm run embed:challenge -- all 먼저 실행.");
    process.exit(0);
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Stage 1 — RPC 직접 호출 (query embedding 생성 후)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const { embedSingle } = await import("../src/lib/mrai/memory/embedding");
  const queryText = [
    `업종: ${SAMPLE.company.industry}`,
    `지역: ${SAMPLE.company.region}`,
    `매출 규모: ${SAMPLE.company.revenue_band}`,
    `종업원: ${SAMPLE.company.employee_band}`,
    `제품: ${SAMPLE.products[0].name} (${SAMPLE.products[0].category})`,
    `목표: ${SAMPLE.goal}`,
  ].join(". ");
  console.log(`  query text (${queryText.length}자): "${queryText}"`);
  const emb = await embedSingle(queryText);
  console.log(`  query embedding dims=${emb.length} head=[${emb.slice(0, 4).map((v) => v.toFixed(4)).join(",")}]`);

  // pgvector는 string literal 또는 number array 양쪽 수락. 코드와 동일하게
  // string literal로 호출해서 production 경로 검증.
  const embeddingLiteral = `[${emb.join(",")}]`;

  const ppRpc = await svc.rpc("ch_match_pp_programs", {
    query_embedding: embeddingLiteral,
    match_count: 5,
  });
  if (ppRpc.error) {
    console.log(`  ❌ ch_match_pp_programs RPC 에러: ${ppRpc.error.message}`);
    console.log(`     hint: ${ppRpc.error.hint ?? "-"}`);
    console.log(`     details: ${JSON.stringify(ppRpc.error.details ?? null)}`);
  } else {
    console.log(`  ✓ ch_match_pp_programs → ${ppRpc.data?.length ?? 0} 후보`);
    for (const r of (ppRpc.data ?? []).slice(0, 3) as Array<{
      program_name: string;
      similarity: number;
    }>) {
      console.log(`    sim=${r.similarity?.toFixed(4)}  ${r.program_name?.slice(0, 60)}`);
    }
  }

  const vchRpc = await svc.rpc("ch_match_voucher_programs", {
    query_embedding: embeddingLiteral,
    match_count: 5,
  });
  if (vchRpc.error) {
    console.log(`  ❌ ch_match_voucher_programs RPC 에러: ${vchRpc.error.message}`);
  } else {
    console.log(`  ✓ ch_match_voucher_programs → ${vchRpc.data?.length ?? 0} 후보`);
    for (const r of (vchRpc.data ?? []).slice(0, 3) as Array<{
      program_name: string;
      similarity: number;
    }>) {
      console.log(`    sim=${r.similarity?.toFixed(4)}  ${r.program_name?.slice(0, 60)}`);
    }
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Stage 2 — recommend() 풀 호출 (LLM rerank 포함)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const hash = hashInput(SAMPLE);
  console.log(`  input_hash: ${hash.slice(0, 16)}…`);

  const t0 = Date.now();
  const res = await recommend(SAMPLE, { topK: 3 });
  const dt = Date.now() - t0;
  console.log(`  stage1_candidates=${res.stage1_candidates}`);
  console.log(`  recommendations=${res.recommendations.length}`);
  console.log(`  cost_usd=$${res.cost_usd}  generation_ms=${dt}`);
  for (const r of res.recommendations) {
    console.log(
      `    [${r.llm_rank}] (${r.type}) score=${r.llm_score} sim=${r.similarity_score}`,
    );
    console.log(`        ${r.program_name}`);
    console.log(`        → ${r.reason?.slice(0, 120)}`);
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Cache 확인 — ch_recommendations 동일 input_hash 행");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  const cached = await svc
    .from("ch_recommendations")
    .select("generated_at, recommendations, model_version")
    .eq("input_hash", hash)
    .order("generated_at", { ascending: false })
    .limit(5);
  if (cached.error) {
    console.log(`  ❌ ${cached.error.message}`);
  } else {
    console.log(`  ${cached.data?.length ?? 0} cached row`);
    for (const c of (cached.data ?? []) as Array<{
      generated_at: string;
      recommendations: unknown;
      model_version: string;
    }>) {
      const arr = Array.isArray(c.recommendations) ? c.recommendations : [];
      console.log(`    ${c.generated_at} model=${c.model_version} recs=${arr.length}`);
    }
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
