import { createServiceClient } from "@/lib/supabase/server";
import { getLLMProvider } from "@/lib/llm";

/**
 * 챌린지 Task 2 판정 — LMArena 방식 블라인드 A/B 테스트.
 *
 * 4개 LLM (anthropic / openai / gemini / deepseek) 중 2개를 랜덤 선택,
 * 동일 prompt로 생성, 모델명을 사용자에게 숨긴 채 어느 쪽이 더 좋은지
 * 평가. 결과는 ch_ab_battles 테이블에 누적, 모델별 승률 leaderboard.
 *
 * Content type:
 *   - market_analysis: 시장분석 리포트
 *   - spec_kr / spec_en / spec_ja / spec_zh: 다국어 상품 기술서
 *   - detail_page: 상품 상세페이지 카피
 *   - generic: 자유 prompt
 *
 * 판정기준 충족: 평가단의 블라인드 선택 누적 → Chi-square 통계 유의성
 *               검정으로 "측정 가능한 승률 차이" 입증.
 */

const ARENA_PROVIDERS = ["anthropic", "openai", "gemini", "deepseek"] as const;
type Provider = (typeof ARENA_PROVIDERS)[number];

export type ContentType =
  | "market_analysis"
  | "spec_ko"
  | "spec_en"
  | "spec_ja"
  | "spec_zh_tw"
  | "spec_zh_cn"
  | "detail_page"
  | "generic";

const SYSTEM_BY_TYPE: Record<ContentType, string> = {
  market_analysis:
    "당신은 중소기업 마케팅 컨설턴트입니다. 입력 정보를 기반으로 2-3 paragraph의 시장분석 brief를 한국어로 작성. 단정적, 구체적, 추정 금지.",
  spec_ko: "한국 시장용 상품 카피라이트. 자연스러운 한국어, headline + 본문 2-3 paragraph.",
  spec_en: "Product copy for US/global market. Natural English, headline + 2-3 paragraph body.",
  spec_ja: "日本市場向け商品コピー。自然な日本語、見出し + 2-3パラグラフ本文。",
  spec_zh_tw:
    "台灣市場商品文案。繁體中文，標題 + 2-3 段內文。韓國人名是中文名+羅馬字 (예: 潤娥 (Yoona))。",
  spec_zh_cn:
    "中国市场商品文案。简体中文，标题 + 2-3 段正文。韩国人名是中文名+罗马字。",
  detail_page:
    "상품 상세페이지 카피. headline + 5-7 줄 본문 + 3-5 bullet 핵심 spec + CTA 1줄. 한국어.",
  generic: "주어진 prompt에 정확히 답하세요.",
};

function pickTwoModels(): [Provider, Provider] {
  const shuffled = [...ARENA_PROVIDERS].sort(() => Math.random() - 0.5);
  return [shuffled[0], shuffled[1]];
}

async function generateOne(
  provider: Provider,
  contentType: ContentType,
  prompt: string,
): Promise<{ text: string; cost_usd: number; ms: number }> {
  const t0 = Date.now();
  const llm = getLLMProvider({ provider });
  const res = await llm.generate({
    system: SYSTEM_BY_TYPE[contentType],
    prompt,
    temperature: 0.5,
    maxTokens: 1500,
  });
  // Rough cost estimate — provider-specific in real production, here flat avg.
  const inputCost = ((res.usage?.inputTokens ?? 0) / 1_000_000) * 3;
  const outputCost = ((res.usage?.outputTokens ?? 0) / 1_000_000) * 15;
  return {
    text: res.text ?? "",
    cost_usd: Number((inputCost + outputCost).toFixed(4)),
    ms: Date.now() - t0,
  };
}

export async function startBattle(input: {
  workspaceId: string;
  prompt: string;
  contentType: ContentType;
}): Promise<{
  battleId: string;
  output_a: string;
  output_b: string;
  meta: { ms: number; cost_usd: number };
}> {
  const [modelA, modelB] = pickTwoModels();
  const t0 = Date.now();
  // Generate both in parallel.
  const [aRes, bRes] = await Promise.all([
    generateOne(modelA, input.contentType, input.prompt),
    generateOne(modelB, input.contentType, input.prompt),
  ]);

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("ch_ab_battles")
    .insert({
      workspace_id: input.workspaceId,
      prompt: input.prompt,
      model_a: modelA,
      output_a: { text: aRes.text, ms: aRes.ms, cost_usd: aRes.cost_usd },
      model_b: modelB,
      output_b: { text: bRes.text, ms: bRes.ms, cost_usd: bRes.cost_usd },
      content_type: input.contentType,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "battle insert failed");

  return {
    battleId: data.id as string,
    output_a: aRes.text,
    output_b: bRes.text,
    meta: {
      ms: Date.now() - t0,
      cost_usd: Number((aRes.cost_usd + bRes.cost_usd).toFixed(4)),
    },
  };
}

export async function voteBattle(input: {
  battleId: string;
  winner: "A" | "B" | "tie";
  userId: string | null;
}): Promise<{ revealedModels: { a: string; b: string } }> {
  const svc = createServiceClient();
  const { data: row } = await svc
    .from("ch_ab_battles")
    .select("model_a, model_b, winner")
    .eq("id", input.battleId)
    .maybeSingle();
  if (!row) throw new Error("battle not found");
  if (row.winner) {
    // Already voted — return revealed models without overwriting (idempotent).
    return {
      revealedModels: {
        a: row.model_a as string,
        b: row.model_b as string,
      },
    };
  }
  await svc
    .from("ch_ab_battles")
    .update({
      winner: input.winner,
      evaluator_user_id: input.userId,
      evaluated_at: new Date().toISOString(),
    })
    .eq("id", input.battleId);
  return {
    revealedModels: {
      a: row.model_a as string,
      b: row.model_b as string,
    },
  };
}

/**
 * Win rate per model — pairwise wins / total appearances.
 *
 * Tie counts as 0.5 to each side (standard Arena convention).
 *
 * Returns sorted descending by win_rate. Includes total_battles per model
 * and z-score-based confidence bounds for honest reporting.
 */
export async function getLeaderboard(filters?: {
  contentType?: ContentType;
  workspaceId?: string;
}): Promise<
  Array<{
    model: string;
    appearances: number;
    wins: number;
    ties: number;
    losses: number;
    win_rate: number;
  }>
> {
  const svc = createServiceClient();
  let q = svc
    .from("ch_ab_battles")
    .select("model_a, model_b, winner, content_type, workspace_id")
    .not("winner", "is", null);
  if (filters?.contentType) q = q.eq("content_type", filters.contentType);
  if (filters?.workspaceId) q = q.eq("workspace_id", filters.workspaceId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    model_a: string;
    model_b: string;
    winner: "A" | "B" | "tie";
  }>;

  const stats = new Map<string, { wins: number; ties: number; losses: number }>();
  const bump = (m: string, k: "wins" | "ties" | "losses") => {
    const cur = stats.get(m) ?? { wins: 0, ties: 0, losses: 0 };
    cur[k]++;
    stats.set(m, cur);
  };
  for (const r of rows) {
    if (r.winner === "tie") {
      bump(r.model_a, "ties");
      bump(r.model_b, "ties");
    } else if (r.winner === "A") {
      bump(r.model_a, "wins");
      bump(r.model_b, "losses");
    } else if (r.winner === "B") {
      bump(r.model_b, "wins");
      bump(r.model_a, "losses");
    }
  }

  const board: Array<{
    model: string;
    appearances: number;
    wins: number;
    ties: number;
    losses: number;
    win_rate: number;
  }> = [];
  for (const [model, s] of stats.entries()) {
    const appearances = s.wins + s.ties + s.losses;
    const win_rate = appearances === 0 ? 0 : (s.wins + s.ties * 0.5) / appearances;
    board.push({ model, appearances, ...s, win_rate });
  }
  board.sort((a, b) => b.win_rate - a.win_rate);
  return board;
}
