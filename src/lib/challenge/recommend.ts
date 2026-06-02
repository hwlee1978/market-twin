import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { embedSingle } from "@/lib/mrai/memory/embedding";
import { getLLMProvider } from "@/lib/llm";

/**
 * 챌린지 적합판로 추천 — Embedding similarity + LLM rerank 2-stage.
 *
 * Stage 1 (cheap, deterministic): pgvector cosine similarity로 ch_pp_programs
 * + ch_voucher_programs에서 상위 N개 후보 추출.
 *
 * Stage 2 (LLM judgement): Claude / Sonnet이 입력 기업 정보 + 후보 N개를
 * 함께 보고 Top-K reranking + 매칭 이유 설명 생성. temperature=0 + seed
 * 명시로 재현성 보장.
 *
 * 재현성 키: 정규화된 input의 SHA-256 → ch_recommendations.input_hash 컬럼
 * 매칭. 동일 input 두 번 실행 시 동일 결과 보장 (판정기준 1 "재현성"
 * 충족).
 *
 * 학습/테스트 분리: dataset_split 컬럼 ('train'/'test'/'holdout'/'prod')
 * 로 평가 시점에 학습/테스트 격리 가능.
 */

export type RecommendInput = {
  company: {
    name?: string;
    industry?: string;          // 업종 코드 또는 명칭
    region?: string;
    revenue_band?: string;
    employee_band?: string;
  };
  products?: Array<{
    name: string;
    category?: string;
    description?: string;
  }>;
  /**
   * 검색 의도 — "내수 지원사업" / "수출바우처" / "both" (default).
   * 사용자의 자유 텍스트 입력도 허용 — LLM rerank가 의도를 파악.
   */
  intent?: "domestic" | "export" | "both";
  /** 자유 텍스트 — "ESG 인증 받고 싶음", "미국 진출 준비" 등 */
  goal?: string;
};

export type RecommendOptions = {
  /** Stage 1 cosine top-N (default 30 per source) */
  candidatesPerSource?: number;
  /** Stage 2 final Top-K (default 5) */
  topK?: number;
  /** 데이터셋 split — 평가용 row 마킹 */
  datasetSplit?: "train" | "test" | "holdout" | "prod";
  /** 추천 모델 버전 — 재훈련 시 증분 */
  modelVersion?: string;
};

export type Recommendation = {
  program_id: string;
  program_table: "ch_pp_programs" | "ch_voucher_programs";
  program_name: string;
  type: "domestic" | "export";
  similarity_score: number;            // Stage 1 cosine [0..1]
  llm_rank: number;                     // Stage 2 rank [1..K]
  llm_score: number;                    // Stage 2 fit score [0..100]
  reason: string;                       // 한국어 매칭 이유
  warnings?: string[];                  // 예: 신청기간 만료, 업종 미스매치 등
};

export type RecommendResult = {
  recommendations: Recommendation[];
  input_hash: string;
  stage1_candidates: number;
  generation_ms: number;
  cost_usd: number;
};

/**
 * 입력 정규화 후 SHA-256 해시. 재현성 키.
 *
 * 정렬·소문자·trim으로 등가 입력이 동일 해시 산출. JSON.stringify는
 * 키 순서 불안정하므로 명시적 정렬 필요.
 */
export function hashInput(input: RecommendInput): string {
  const normalized = {
    company: {
      name: (input.company.name ?? "").trim().toLowerCase(),
      industry: (input.company.industry ?? "").trim().toLowerCase(),
      region: (input.company.region ?? "").trim().toLowerCase(),
      revenue_band: (input.company.revenue_band ?? "").trim().toLowerCase(),
      employee_band: (input.company.employee_band ?? "").trim().toLowerCase(),
    },
    products: (input.products ?? [])
      .map((p) => ({
        name: p.name.trim().toLowerCase(),
        category: (p.category ?? "").trim().toLowerCase(),
        description: (p.description ?? "").trim().toLowerCase(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    intent: input.intent ?? "both",
    goal: (input.goal ?? "").trim().toLowerCase(),
  };
  return createHash("sha256")
    .update(JSON.stringify(normalized), "utf8")
    .digest("hex");
}

/**
 * 입력을 embedding query 텍스트로 변환. 기업 정보 + 제품 + 의도를
 * 자연스러운 한국어 paragraph로.
 */
function inputToQueryText(input: RecommendInput): string {
  const parts: string[] = [];
  const c = input.company;
  if (c.industry) parts.push(`업종: ${c.industry}`);
  if (c.region) parts.push(`지역: ${c.region}`);
  if (c.revenue_band) parts.push(`매출 규모: ${c.revenue_band}`);
  if (c.employee_band) parts.push(`종업원: ${c.employee_band}`);
  if (input.products && input.products.length > 0) {
    parts.push(
      `제품: ${input.products
        .map((p) => `${p.name}${p.category ? ` (${p.category})` : ""}`)
        .join(", ")}`,
    );
  }
  if (input.goal) parts.push(`목표: ${input.goal}`);
  return parts.join(". ");
}

const SYSTEM_PROMPT = `당신은 한국 중소기업의 정부 지원사업 매칭 전문 컨설턴트입니다.

입력 기업의 업종·제품·목표를 보고, 주어진 후보 지원사업·바우처 프로그램 중
가장 적합한 Top-K개를 선정합니다.

판단 기준:
1. 업종/제품 적합성 (가장 중요)
2. 지원 대상 자격 충족 (매출·종업원·지역)
3. 신청 가능 여부 (기간 / 모집 상태)
4. 입력 목표(goal)와의 정합성

출력은 JSON only:
{
  "ranked": [
    {
      "candidate_index": 0,
      "score": 0~100,
      "reason": "한국어 1-2문장 — 왜 이 사업이 적합한지",
      "warnings": ["선택 사항: 업종 미스매치 / 신청기간 만료 등"]
    },
    ...
  ]
}

⚠️ 절대 규칙:
- 한국어로만 답변
- candidate_index는 입력 후보 배열의 0-indexed 위치
- 추정·창작 금지 — 후보 정보에 명시된 사실만 인용
- 최대 K개까지 (입력 K=5면 5개)
- 적합한 후보가 K개 미만이면 fewer개만 반환`;

export async function recommend(
  input: RecommendInput,
  options: RecommendOptions = {},
): Promise<RecommendResult> {
  const t0 = Date.now();
  const candidatesPerSource = options.candidatesPerSource ?? 30;
  const topK = options.topK ?? 5;
  const svc = createServiceClient();

  // Stage 1 — query embedding
  const queryText = inputToQueryText(input);
  const queryEmbedding = await embedSingle(queryText);

  // Stage 1 — cosine similarity on both program tables.
  // pgvector <=> operator = cosine distance (0 = identical, 2 = opposite).
  // similarity_score = 1 - distance.
  const intent = input.intent ?? "both";
  const wantDomestic = intent === "domestic" || intent === "both";
  const wantExport = intent === "export" || intent === "both";

  type Candidate = {
    id: string;
    table: "ch_pp_programs" | "ch_voucher_programs";
    name: string;
    purpose: string | null;
    eligibility: string | null;
    support_content: string | null;
    application_period: string | null;
    organization: string | null;
    similarity_score: number;
  };

  const candidates: Candidate[] = [];
  const embeddingLiteral = `[${queryEmbedding.join(",")}]`;

  if (wantDomestic) {
    const { data, error } = await svc.rpc("ch_match_pp_programs", {
      query_embedding: embeddingLiteral,
      match_count: candidatesPerSource,
    });
    if (error) {
      // Fallback: direct SQL via service client (rpc may not be set up yet).
      const { data: fb } = await svc
        .from("ch_pp_programs")
        .select("id, program_name, program_purpose, eligibility, support_content, application_period, organization, embedding")
        .not("embedding", "is", null)
        .limit(candidatesPerSource);
      for (const r of (fb ?? []) as Array<{
        id: string;
        program_name: string;
        program_purpose: string | null;
        eligibility: string | null;
        support_content: string | null;
        application_period: string | null;
        organization: string | null;
      }>) {
        candidates.push({
          id: r.id,
          table: "ch_pp_programs",
          name: r.program_name,
          purpose: r.program_purpose,
          eligibility: r.eligibility,
          support_content: r.support_content,
          application_period: r.application_period,
          organization: r.organization,
          similarity_score: 0, // fallback path doesn't compute similarity
        });
      }
    } else {
      for (const r of (data ?? []) as Array<{
        id: string;
        program_name: string;
        program_purpose: string | null;
        eligibility: string | null;
        support_content: string | null;
        application_period: string | null;
        organization: string | null;
        similarity: number;
      }>) {
        candidates.push({
          id: r.id,
          table: "ch_pp_programs",
          name: r.program_name,
          purpose: r.program_purpose,
          eligibility: r.eligibility,
          support_content: r.support_content,
          application_period: r.application_period,
          organization: r.organization,
          similarity_score: r.similarity,
        });
      }
    }
  }

  if (wantExport) {
    const { data, error } = await svc.rpc("ch_match_voucher_programs", {
      query_embedding: embeddingLiteral,
      match_count: candidatesPerSource,
    });
    if (error) {
      const { data: fb } = await svc
        .from("ch_voucher_programs")
        .select("id, program_name, eligibility, support_content, application_period, organization, selection_criteria")
        .not("embedding", "is", null)
        .limit(candidatesPerSource);
      for (const r of (fb ?? []) as Array<{
        id: string;
        program_name: string;
        eligibility: string | null;
        support_content: string | null;
        application_period: string | null;
        organization: string | null;
      }>) {
        candidates.push({
          id: r.id,
          table: "ch_voucher_programs",
          name: r.program_name,
          purpose: null,
          eligibility: r.eligibility,
          support_content: r.support_content,
          application_period: r.application_period,
          organization: r.organization,
          similarity_score: 0,
        });
      }
    } else {
      for (const r of (data ?? []) as Array<{
        id: string;
        program_name: string;
        eligibility: string | null;
        support_content: string | null;
        application_period: string | null;
        organization: string | null;
        similarity: number;
      }>) {
        candidates.push({
          id: r.id,
          table: "ch_voucher_programs",
          name: r.program_name,
          purpose: null,
          eligibility: r.eligibility,
          support_content: r.support_content,
          application_period: r.application_period,
          organization: r.organization,
          similarity_score: r.similarity,
        });
      }
    }
  }

  // Sort by similarity_score desc (fallback path leaves all at 0).
  candidates.sort((a, b) => b.similarity_score - a.similarity_score);
  const stage1Count = candidates.length;

  if (candidates.length === 0) {
    return {
      recommendations: [],
      input_hash: hashInput(input),
      stage1_candidates: 0,
      generation_ms: Date.now() - t0,
      cost_usd: 0,
    };
  }

  // Stage 2 — LLM rerank
  const provider = getLLMProvider({ provider: "anthropic" });
  const rerankPrompt = `# 입력 기업
${queryText || "(정보 없음)"}

# 후보 ${candidates.length}개 (0-indexed)
${candidates
  .map(
    (c, i) =>
      `[${i}] (${c.table === "ch_pp_programs" ? "내수" : "수출"}) ${c.name}
  목적: ${c.purpose ?? "-"}
  대상: ${(c.eligibility ?? "-").slice(0, 200)}
  내용: ${(c.support_content ?? "-").slice(0, 200)}
  기관: ${c.organization ?? "-"}
  기간: ${c.application_period ?? "-"}`,
  )
  .join("\n\n")}

# 작업
위 후보 중 입력 기업에 가장 적합한 Top-${topK}개를 선정. JSON으로 출력.`;

  const llmRes = await provider.generate({
    system: SYSTEM_PROMPT,
    prompt: rerankPrompt,
    temperature: 0,
    maxTokens: 2500,
    cacheSystem: true,
    expectedArrayKey: "ranked",
    // jsonSchema 전달 → provider가 wantsJson 경로로 진입해서 ```json fence
    // 제거 + recoverJsonFromText 호출. 없으면 llmRes.json이 undefined.
    jsonSchema: {
      type: "object",
      properties: {
        ranked: {
          type: "array",
          items: {
            type: "object",
            properties: {
              candidate_index: { type: "integer" },
              score: { type: "number" },
              reason: { type: "string" },
              warnings: { type: "array", items: { type: "string" } },
            },
            required: ["candidate_index", "score", "reason"],
          },
        },
      },
      required: ["ranked"],
    },
  });

  const raw = (llmRes.json as { ranked?: Array<{
    candidate_index: number;
    score: number;
    reason: string;
    warnings?: string[];
  }> }) ?? {};
  const ranked = Array.isArray(raw.ranked) ? raw.ranked : [];

  // 진단 로그 — 매칭 흐름의 빈 결과 원인 추적
  console.log(
    `[recommend] stage1=${candidates.length} → llm ranked=${ranked.length} ` +
      `raw keys=[${Object.keys(raw).join(",")}] ` +
      `text head: "${(llmRes.text ?? "").slice(0, 200).replace(/\s+/g, " ")}"`,
  );

  const recommendations: Recommendation[] = [];
  for (let i = 0; i < Math.min(ranked.length, topK); i++) {
    const r = ranked[i];
    const c = candidates[r.candidate_index];
    if (!c) continue;
    recommendations.push({
      program_id: c.id,
      program_table: c.table,
      program_name: c.name,
      type: c.table === "ch_pp_programs" ? "domestic" : "export",
      similarity_score: Number(c.similarity_score.toFixed(4)),
      llm_rank: recommendations.length + 1,
      llm_score: Math.max(0, Math.min(100, r.score)),
      reason: r.reason,
      warnings: r.warnings,
    });
  }

  // Cost estimate (Sonnet 4.6 approx).
  const inputTokens = llmRes.usage?.inputTokens ?? 0;
  const outputTokens = llmRes.usage?.outputTokens ?? 0;
  const costUsd = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15;

  return {
    recommendations,
    input_hash: hashInput(input),
    stage1_candidates: stage1Count,
    generation_ms: Date.now() - t0,
    cost_usd: Number(costUsd.toFixed(4)),
  };
}

/**
 * 추천 결과를 ch_recommendations 테이블에 영구 저장. dataset_split으로
 * 학습/테스트 격리 + input_hash로 재현성 검증 가능.
 */
export async function persistRecommendation(
  workspaceId: string,
  input: RecommendInput,
  result: RecommendResult,
  options: { datasetSplit?: string; modelVersion?: string } = {},
): Promise<{ id: string }> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("ch_recommendations")
    .insert({
      workspace_id: workspaceId,
      input_company: input as unknown as Record<string, unknown>,
      input_hash: result.input_hash,
      recommendations: result.recommendations as unknown as Record<string, unknown>[],
      model_version: options.modelVersion ?? "v1.0",
      dataset_split: options.datasetSplit ?? "prod",
      generation_ms: result.generation_ms,
      cost_usd: result.cost_usd,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "persist failed");
  return { id: data.id as string };
}

/**
 * 재현성 검증 — 동일 input_hash로 이미 실행된 결과가 있으면 반환.
 * 평가 단계에서 "동일 조건 → 동일 결과" 보장 확인용.
 */
export async function findReproducibleRun(
  inputHash: string,
  modelVersion = "v1.0",
): Promise<{ recommendations: Recommendation[]; generated_at: string } | null> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("ch_recommendations")
    .select("recommendations, generated_at")
    .eq("input_hash", inputHash)
    .eq("model_version", modelVersion)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const recs = data.recommendations as unknown;
  // 빈 결과 cache는 무시 — 이전 (임베딩 생성 전) 호출이 저장한 빈
  // recommendations[]가 영구히 캐시 hit 되는 것 방지. 데이터가 적재된
  // 후 같은 input으로 다시 호출하면 새로 LLM rerank 실행.
  if (!Array.isArray(recs) || recs.length === 0) return null;
  return {
    recommendations: recs as Recommendation[],
    generated_at: data.generated_at as string,
  };
}
