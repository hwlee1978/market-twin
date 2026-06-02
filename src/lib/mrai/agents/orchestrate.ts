import { createServiceClient } from "@/lib/supabase/server";
import { getLLMProvider } from "@/lib/llm";
import { runStrategist, type Locale, type StrategistPlan } from "./market-strategist";
import { runAnalyst, type AnalystEvidence } from "./analyst";
import { runSynthesizer } from "./synthesizer";

/**
 * 3-LAYER ORCHESTRATOR
 *
 * runMrAIChat (in chat.ts) calls this. We decide between:
 *   - "simple" mode — short greeting / one-word question → 1 cheap LLM call
 *   - "full" mode   — L1 plan → L2 evidence → L3 synthesize
 *
 * Trace is persisted to mrai_agent_traces for debugging + future
 * KPI-loop training data (Sprint 3).
 */

export interface OrchestratorInput {
  workspaceId: string;
  conversationId: string | null;
  userMessage: string;
  locale: Locale;
}

export interface OrchestratorResult {
  text: string;
  mode: "full" | "simple";
  plan: StrategistPlan | null;
  evidence: AnalystEvidence | null;
  totalMs: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  trace: {
    l1?: { plan: StrategistPlan; input: number; output: number; ms: number };
    l2?: {
      evidenceSummary: {
        memoryCount: number;
        signalCount: number;
        historyCount: number;
        entityCount: number;
        relationCount: number;
        notes: string[];
      };
      ms: number;
    };
    l3: { input: number; output: number; ms: number };
  };
}

/**
 * Heuristic: skip 3-layer when the message is clearly a greeting or
 * trivial confirmation. Saves ~2 LLM calls when it doesn't matter.
 *
 * Conservative: defaults to full mode unless message matches a tight
 * pattern. Cost of false-negative (running full on simple) is small;
 * cost of false-positive (skipping evidence on a real question) is big.
 */
function isSimpleMessage(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return true;
  if (t.length > 30) return false;
  // Anything with a question mark, numbers, or proper-noun-looking caps → full
  if (/[?？]/.test(t)) return false;
  if (/\d/.test(t)) return false;
  if (/\b[A-Z][a-z]+/.test(t)) return false;
  // Greeting / acknowledge patterns
  const PATTERNS = [
    /^(안녕|반가워|반갑|고마워|땡큐|오케이|ok|okay|넵|네|좋아|좋네|알겠어|잘했어)/i,
    /^(hi|hello|hey|thanks|thx|ok|sure|good)\b/i,
    /^(테스트|test)$/i,
  ];
  return PATTERNS.some((re) => re.test(t));
}

async function runSimplePath(input: OrchestratorInput): Promise<{ text: string; usage: { input?: number; output?: number }; ms: number }> {
  const t0 = Date.now();
  const persona =
    input.locale === "en"
      ? `You are Mr. AI, a concise CEO assistant. Reply in 1-2 short sentences. Same language as the user.`
      : `당신은 Mr. AI, 간결한 CEO 비서입니다. 1-2 문장으로 짧게 답하세요. 사용자와 같은 언어로.`;
  const provider = getLLMProvider({ provider: "anthropic", model: "claude-haiku-4-5-20251001" });
  const res = await provider.generate({
    system: persona,
    prompt: input.userMessage,
    temperature: 0.5,
    maxTokens: 300,
    cacheSystem: false,
  });
  return {
    text: (res.text ?? "").trim() || (input.locale === "en" ? "(empty)" : "(빈 응답)"),
    usage: { input: res.usage?.inputTokens, output: res.usage?.outputTokens },
    ms: Date.now() - t0,
  };
}

export async function orchestrate(input: OrchestratorInput): Promise<OrchestratorResult> {
  const t0 = Date.now();

  // --- Simple path bypass ---
  if (isSimpleMessage(input.userMessage)) {
    const simple = await runSimplePath(input);
    return {
      text: simple.text,
      mode: "simple",
      plan: null,
      evidence: null,
      totalMs: Date.now() - t0,
      usage: {
        inputTokens: simple.usage.input ?? 0,
        outputTokens: simple.usage.output ?? 0,
      },
      trace: {
        l3: { input: simple.usage.input ?? 0, output: simple.usage.output ?? 0, ms: simple.ms },
      },
    };
  }

  // --- Full 3-Layer pipeline ---
  const l1 = await runStrategist({ userMessage: input.userMessage, locale: input.locale });
  const l2 = await runAnalyst({
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    userMessage: input.userMessage,
    plan: l1.plan,
  });
  const l3 = await runSynthesizer({
    userMessage: input.userMessage,
    plan: l1.plan,
    evidence: l2.evidence,
    locale: input.locale,
  });

  return {
    text: l3.text,
    mode: "full",
    plan: l1.plan,
    evidence: l2.evidence,
    totalMs: Date.now() - t0,
    usage: {
      inputTokens: (l1.usage.input ?? 0) + (l3.usage.input ?? 0),
      outputTokens: (l1.usage.output ?? 0) + (l3.usage.output ?? 0),
    },
    trace: {
      l1: { plan: l1.plan, input: l1.usage.input ?? 0, output: l1.usage.output ?? 0, ms: l1.ms },
      l2: {
        evidenceSummary: {
          memoryCount: l2.evidence.memories.length,
          signalCount: l2.evidence.signals.length,
          historyCount: l2.evidence.history.length,
          entityCount: l2.evidence.kg.entities.length,
          relationCount: l2.evidence.kg.relations.length,
          notes: l2.evidence.notes,
        },
        ms: l2.ms,
      },
      l3: { input: l3.usage.input ?? 0, output: l3.usage.output ?? 0, ms: l3.ms },
    },
  };
}

export async function saveAgentTrace(input: {
  workspaceId: string;
  conversationId: string;
  userMessageId: string;
  asstMessageId: string;
  result: OrchestratorResult;
}): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("mrai_agent_traces").insert({
    workspace_id: input.workspaceId,
    conversation_id: input.conversationId,
    user_message_id: input.userMessageId,
    asst_message_id: input.asstMessageId,
    mode: input.result.mode,
    l1_plan: input.result.trace.l1?.plan ?? null,
    l1_input_tokens: input.result.trace.l1?.input ?? null,
    l1_output_tokens: input.result.trace.l1?.output ?? null,
    l1_ms: input.result.trace.l1?.ms ?? null,
    l2_evidence: input.result.trace.l2?.evidenceSummary ?? null,
    l2_ms: input.result.trace.l2?.ms ?? null,
    l3_text: input.result.text,
    l3_input_tokens: input.result.trace.l3.input,
    l3_output_tokens: input.result.trace.l3.output,
    l3_ms: input.result.trace.l3.ms,
    total_ms: input.result.totalMs,
  });
  if (error) {
    console.error("[mrai] saveAgentTrace failed", error.message);
  }
}
