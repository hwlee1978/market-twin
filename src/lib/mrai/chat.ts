import { createServiceClient } from "@/lib/supabase/server";
import {
  extractMemoriesFromTurn,
  loadRelevantMemories,
  saveMemories,
  type MemoryRow,
} from "./memory";
import { orchestrate, saveAgentTrace } from "./agents/orchestrate";
import { saveKgFromTurn } from "./kg";
import {
  proposeSimulation,
  type SimulationProposal,
} from "./agents/simulation-proposer";
import {
  recommendChannels,
  type RecommendedChannel,
} from "./agents/channel-recommender";

/**
 * Orchestrates one round-trip with Mr. AI:
 *   1. Load (or create) the conversation row
 *   2. Load workspace memories + recent message history
 *   3. Build system prompt with memory prefix + persona
 *   4. Call LLM
 *   5. Persist user + assistant messages
 *   6. Fire-and-forget memory extraction on the new turn
 *
 * Returns the assistant text plus the conversation id so the client can
 * keep talking on the same thread without round-tripping a list query.
 *
 * Memory extraction failure is swallowed — the user got their answer,
 * we just don't grow the memory store this turn. Logged for debugging.
 */

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
  /** Optional structured actions attached to assistant messages. */
  actions?: ChatAction[];
};

export type ChatLocale = "ko" | "en";

export type ChatAction =
  | { type: "simulation_proposal"; payload: SimulationProposal }
  | {
      type: "channel_recommendations";
      payload: {
        countries: string[];
        recommendations: Array<RecommendedChannel & { id: string; selected?: boolean }>;
      };
    };

/**
 * Cheap regex gate for "should we generate a simulation proposal?" Avoids
 * a Sonnet call on every chat turn.
 *
 * Earlier version was too loose: any mention of "시뮬" triggered a card,
 * so "방금 끝난 시뮬 결과를 메모리에 통합해줘" produced a useless new
 * proposal card (the real intent was memory integration). v2 requires
 * (a) no negative-intent keywords (결과/통합/보여/취소/상태…) and
 * (b) either an action verb (돌려/실행/시작) co-occurring with a sim
 * keyword, OR a direct "진출 검증/시장 분석" phrase.
 *
 * False-negative ("메이트 시뮬" alone) is preferable — user can add
 * "돌려줘" and we'll catch it. False-positive overrides real answers,
 * which is worse UX than missing an implicit request.
 */
/**
 * Detects requests to recommend marketing channels for a target market.
 * Examples: "마케팅 채널 추천", "어디에 올려야 해?", "SNS 추천해줘",
 * "미국 시장 채널", "recommend channels".
 *
 * Negative gate prevents conflict with "결과/상태/이미 등록한 채널" etc.
 */
function looksLikeChannelRecommendationRequest(message: string): boolean {
  const m = message.toLowerCase();
  if (/이미\s*등록|이미\s*있는|현재\s*채널|연결한\s*채널|등록된/i.test(m)) {
    return false;
  }
  if (/마케팅\s*채널|sns\s*추천|블로그\s*추천|어디에\s*올려|어디에\s*포스팅|channel\s*recommend|recommend\s*channels|where\s*to\s*post|마케팅\s*어디|광고\s*어디/i.test(m)) {
    return true;
  }
  // "X 채널 추천" + 시뮬/시장 키워드 동시 매칭
  const hasChannelKeyword = /채널|channels/i.test(m);
  const hasRecommendVerb = /추천|제안|알려|recommend|suggest/i.test(m);
  if (hasChannelKeyword && hasRecommendVerb && /시장|마케팅|진출|포스팅|블로그|sns/i.test(m)) {
    return true;
  }
  return false;
}

/**
 * Resolve target countries for a channel-recommendation request:
 *   1. ISO-2 codes explicitly mentioned in the user message
 *   2. Common Korean country names → ISO-2
 *   3. The most recent completed ensemble in this workspace (winner +
 *      runner-up from its aggregate_result)
 *   4. [] (caller surfaces a "give me a country" message)
 */
async function deriveTargetCountries(input: {
  workspaceId: string;
  userMessage: string;
}): Promise<string[]> {
  // 1. Explicit ISO-2 (uppercase) in the message — be conservative,
  //    require word-boundary so "US" matches "US 시장" but not random
  //    capitals inside English words.
  const explicit = new Set<string>();
  const isoMatches = input.userMessage.match(/\b(US|JP|KR|TW|CN|SG|VN|TH|ID|MY|PH|GB|DE|FR|AU|NZ|CA|MX|BR|IN|AE)\b/g);
  for (const m of isoMatches ?? []) explicit.add(m.toUpperCase());

  // 2. Korean / English country names
  const NAME_MAP: Record<string, string> = {
    "미국": "US", "미주": "US", "US": "US", america: "US",
    "일본": "JP", "도쿄": "JP", "japan": "JP",
    "한국": "KR", "국내": "KR", "korea": "KR",
    "대만": "TW", "taiwan": "TW",
    "중국": "CN", "china": "CN",
    "싱가포르": "SG", "singapore": "SG",
    "베트남": "VN", "vietnam": "VN",
    "태국": "TH", "thailand": "TH",
    "인도네시아": "ID", "indonesia": "ID",
    "말레이시아": "MY", "malaysia": "MY",
    "필리핀": "PH", "philippines": "PH",
  };
  const lower = input.userMessage.toLowerCase();
  for (const [name, code] of Object.entries(NAME_MAP)) {
    if (lower.includes(name.toLowerCase())) explicit.add(code);
  }
  if (explicit.size > 0) return Array.from(explicit).slice(0, 4);

  // 3. Most recent ensemble winner + runner-up
  const supabase = createServiceClient();
  const { data: ens } = await supabase
    .from("ensembles")
    .select("aggregate_result")
    .eq("workspace_id", input.workspaceId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const agg = (ens?.aggregate_result ?? null) as
    | { bestCountryDistribution?: Array<{ country: string; percent: number }> }
    | null;
  if (agg?.bestCountryDistribution?.length) {
    const top = agg.bestCountryDistribution[0]?.country;
    const tied = agg.bestCountryDistribution
      .filter((d) => d.percent === agg.bestCountryDistribution![0]!.percent)
      .map((d) => d.country);
    const list = tied.length > 1 ? tied : [top, agg.bestCountryDistribution[1]?.country].filter(Boolean);
    return Array.from(new Set(list as string[])).slice(0, 3);
  }
  return [];
}

function looksLikeSimulationRequest(message: string): boolean {
  const m = message.toLowerCase();

  // Negative gate: requests *about* a simulation (result, status,
  // integration, cancel) shouldn't spawn a new proposal card.
  if (/결과|통합|저장|취소|보여|상태|진행|완료|언제|어디|에러|실패|중단|중지|기억|remember|status|cancel|stop/i.test(m)) {
    return false;
  }

  // Direct phrases that always imply running a new simulation.
  if (/진출\s*검증|시장\s*검증|진출\s*분석|시장\s*분석|run\s*sim|simulate/i.test(m)) {
    return true;
  }

  // Sim keyword + explicit action verb.
  const hasSimKeyword = /시뮬|시뮬레이션|simulation/i.test(m);
  if (!hasSimKeyword) return false;
  return /돌려|실행|시작|시도|run|start|go|new|새로|검증해|분석해/i.test(m);
}

export interface AgentTraceSummary {
  mode: "full" | "simple";
  totalMs: number;
  l1?: { ms: number };
  l2?: {
    ms: number;
    memoryCount: number;
    signalCount: number;
    historyCount: number;
    entityCount: number;
    relationCount: number;
    notes: string[];
  };
  l3: { ms: number };
}

export async function runMrAIChat(input: {
  workspaceId: string;
  userId: string;
  conversationId: string | null;
  userMessage: string;
  locale?: ChatLocale;
}): Promise<{
  conversationId: string;
  assistantMessage: string;
  assistantMessageId: string;
  newMemories: number;
  actions: ChatAction[];
  trace: AgentTraceSummary;
}> {
  const supabase = createServiceClient();

  // 1. Conversation
  let convoId = input.conversationId;
  if (!convoId) {
    const { data, error } = await supabase
      .from("mrai_conversations")
      .insert({
        workspace_id: input.workspaceId,
        user_id: input.userId,
        title: input.userMessage.slice(0, 60),
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`create conversation: ${error?.message}`);
    convoId = data.id as string;
  } else {
    // Ownership guard — the route also enforces RLS but defense in depth
    const { data: existing } = await supabase
      .from("mrai_conversations")
      .select("workspace_id")
      .eq("id", convoId)
      .maybeSingle();
    if (!existing || existing.workspace_id !== input.workspaceId) {
      throw new Error("conversation not found");
    }
  }

  // 2. Insert the user message first so it's part of the durable record
  // even if the LLM call fails on transient errors.
  const { data: userRow, error: userErr } = await supabase
    .from("mrai_messages")
    .insert({
      conversation_id: convoId,
      role: "user",
      content: input.userMessage,
    })
    .select("id")
    .single();
  if (userErr || !userRow) throw new Error(`save user msg: ${userErr?.message}`);

  // 3. Run the 3-Layer Agent orchestrator (Strategist → Analyst → Synthesizer).
  // It auto-bypasses to a single cheap LLM call for trivial greetings.
  const locale: ChatLocale = input.locale ?? "ko";
  const orchestrated = await orchestrate({
    workspaceId: input.workspaceId,
    conversationId: convoId,
    userMessage: input.userMessage,
    locale,
  });
  const assistantText = orchestrated.text;

  // We still need the post-extraction memory list (NOT the L2 evidence —
  // memory extraction wants the broader recent set to dedup properly).
  const memoriesForExtraction = orchestrated.evidence?.memories
    ?? (await loadRelevantMemories({
      workspaceId: input.workspaceId,
      queryText: input.userMessage,
      matchCount: 20,
    }));

  // 3.5 Action proposals — chat-side intent forks. Failure here doesn't
  // break the response; we just skip the card.
  const actions: ChatAction[] = [];
  let finalAssistantText = assistantText;
  if (looksLikeSimulationRequest(input.userMessage)) {
    try {
      const proposal = await proposeSimulation({
        workspaceId: input.workspaceId,
        userMessage: input.userMessage,
        locale,
      });
      actions.push({ type: "simulation_proposal", payload: proposal });
      finalAssistantText =
        locale === "en"
          ? `Prepared a simulation input draft from workspace memory. Review and edit the fields in the card below, then click **Start simulation**. Tier defaults to ${proposal.tier} (you can change it). Estimated wait: 15-25 minutes for Decision tier; you'll get Email + Slack notifications when it completes.`
          : `워크스페이스 메모리 기반으로 시뮬레이션 input을 준비했습니다. 아래 카드에서 검토·수정 후 **"시뮬 시작"** 버튼을 눌러주세요. 기본 Tier는 ${proposal.tier}이며 다른 옵션으로 변경 가능합니다. 완료까지 약 15-25분 소요되고, Email + Slack로 자동 알림 갑니다.`;
    } catch (e) {
      console.error("[mrai] simulation proposal failed", e);
    }
  } else if (looksLikeChannelRecommendationRequest(input.userMessage)) {
    try {
      // Derive target countries from (a) explicit ISO codes in the
      // message, (b) the most recent completed ensemble's winner /
      // runner-up, or (c) fall back to memory-mentioned markets.
      const countries = await deriveTargetCountries({
        workspaceId: input.workspaceId,
        userMessage: input.userMessage,
      });
      if (countries.length === 0) {
        finalAssistantText =
          locale === "en"
            ? "I need at least one target country to recommend channels. Run a simulation first, or mention a country (e.g. 'recommend channels for US')."
            : "마케팅 채널을 추천하려면 타겟 국가가 필요합니다. 시뮬레이션을 먼저 돌리거나 메시지에 국가를 명시해주세요 (예: '미국 채널 추천해줘').";
      } else {
        const rec = await recommendChannels({
          workspaceId: input.workspaceId,
          countries,
          locale,
        });
        actions.push({
          type: "channel_recommendations",
          payload: {
            countries,
            recommendations: rec.recommendations.map((r) => ({ ...r, selected: false })),
          },
        });
        const countryList = countries.join(", ");
        finalAssistantText =
          locale === "en"
            ? `Recommended ${rec.recommendations.length} marketing channels across ${countryList} based on your workspace memory + target persona. Toggle the ones you want to activate — selected channels feed the upcoming content-draft generator.`
            : `${countryList} 시장에 대해 워크스페이스 메모리 + 타겟 페르소나 기반으로 마케팅 채널 ${rec.recommendations.length}개를 추천했습니다. 활성화할 채널을 토글하세요 — 선택된 채널은 다음 단계인 콘텐츠 자동 생성기에 연결됩니다.`;
      }
    } catch (e) {
      console.error("[mrai] channel recommendation failed", e);
    }
  }

  // 4. Save assistant message + agent trace
  const { data: asstRow, error: asstErr } = await supabase
    .from("mrai_messages")
    .insert({
      conversation_id: convoId,
      role: "assistant",
      content: finalAssistantText,
      input_tokens: orchestrated.usage.inputTokens,
      output_tokens: orchestrated.usage.outputTokens,
      actions: actions.length > 0 ? actions : null,
    })
    .select("id")
    .single();
  if (asstErr || !asstRow) throw new Error(`save assistant msg: ${asstErr?.message}`);

  await saveAgentTrace({
    workspaceId: input.workspaceId,
    conversationId: convoId,
    userMessageId: userRow.id as string,
    asstMessageId: asstRow.id as string,
    result: orchestrated,
  });

  // Bump conversation updated_at so the UI can sort threads
  await supabase
    .from("mrai_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", convoId);

  // 5. Memory extraction + KG extraction — run in parallel, both
  // best-effort. Neither blocks the user-facing response.
  let newMemoryCount = 0;
  const memoryTask = (async () => {
    try {
      const extracted = await extractMemoriesFromTurn({
        userMessage: input.userMessage,
        assistantReply: assistantText,
        existingMemories: memoriesForExtraction,
      });
      if (extracted.length > 0) {
        await saveMemories({
          workspaceId: input.workspaceId,
          userId: input.userId,
          sourceMessageId: asstRow.id as string,
          memories: extracted,
        });
        newMemoryCount = extracted.length;
      }
    } catch (e) {
      console.error("[mrai] memory extraction failed", e);
    }
  })();

  const kgTask = (async () => {
    try {
      await saveKgFromTurn({
        workspaceId: input.workspaceId,
        userMessage: input.userMessage,
        assistantReply: assistantText,
        sourceMemoryId: null, // KG isn't tied to a specific memory row
      });
    } catch (e) {
      console.error("[mrai] kg extraction failed", e);
    }
  })();

  await Promise.all([memoryTask, kgTask]);

  const traceSummary: AgentTraceSummary = {
    mode: orchestrated.mode,
    totalMs: orchestrated.totalMs,
    l1: orchestrated.trace.l1 ? { ms: orchestrated.trace.l1.ms } : undefined,
    l2: orchestrated.trace.l2
      ? {
          ms: orchestrated.trace.l2.ms,
          memoryCount: orchestrated.trace.l2.evidenceSummary.memoryCount,
          signalCount: orchestrated.trace.l2.evidenceSummary.signalCount,
          historyCount: orchestrated.trace.l2.evidenceSummary.historyCount,
          entityCount: orchestrated.trace.l2.evidenceSummary.entityCount,
          relationCount: orchestrated.trace.l2.evidenceSummary.relationCount,
          notes: orchestrated.trace.l2.evidenceSummary.notes,
        }
      : undefined,
    l3: { ms: orchestrated.trace.l3.ms },
  };

  return {
    conversationId: convoId,
    assistantMessage: finalAssistantText,
    assistantMessageId: asstRow.id as string,
    newMemories: newMemoryCount,
    actions,
    trace: traceSummary,
  };
}

export async function listConversations(workspaceId: string): Promise<
  Array<{ id: string; title: string | null; updated_at: string }>
> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("mrai_conversations")
    .select("id, title, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`list conversations: ${error.message}`);
  return (data ?? []) as Array<{ id: string; title: string | null; updated_at: string }>;
}

export async function loadConversationMessages(
  workspaceId: string,
  conversationId: string,
): Promise<ChatTurn[]> {
  const supabase = createServiceClient();
  const { data: conv } = await supabase
    .from("mrai_conversations")
    .select("workspace_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv || conv.workspace_id !== workspaceId) return [];

  const { data, error } = await supabase
    .from("mrai_messages")
    .select("role, content, actions")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`load messages: ${error.message}`);
  const rows = (data ?? []) as Array<{
    role: string;
    content: string;
    actions: ChatAction[] | null;
  }>;
  return rows
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
      actions: m.actions ?? undefined,
    }));
}

export async function summarizeMemoryCount(memories: MemoryRow[]): Promise<{
  total: number;
  byKind: Record<string, number>;
}> {
  const byKind: Record<string, number> = {};
  for (const m of memories) byKind[m.kind] = (byKind[m.kind] ?? 0) + 1;
  return { total: memories.length, byKind };
}
