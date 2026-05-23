"use client";

import { Brain, Clock, Database, Sparkles, Zap } from "lucide-react";

export type AgentTraceData = {
  mode: "full" | "simple";
  totalMs: number;
  l1?: { ms: number };
  l2?: {
    ms: number;
    memoryCount: number;
    signalCount: number;
    historyCount: number;
    entityCount?: number;
    relationCount?: number;
    notes: string[];
  };
  l3: { ms: number };
};

/**
 * Compact agent-trace badge shown next to an assistant turn. Lets the
 * user see at a glance whether Mr. AI ran the full 3-layer pipeline or
 * short-circuited, how many memories/signals fed into the answer, and
 * total latency. Click to expand detail.
 */
export function AgentTrace({ trace }: { trace: AgentTraceData }) {
  if (trace.mode === "simple") {
    return (
      <div className="inline-flex items-center gap-1 text-[10px] text-slate-400">
        <Zap className="w-3 h-3" />
        <span>quick</span>
        <span>·</span>
        <span>{(trace.totalMs / 1000).toFixed(1)}s</span>
      </div>
    );
  }

  const memCount = trace.l2?.memoryCount ?? 0;
  const sigCount = trace.l2?.signalCount ?? 0;
  const histCount = trace.l2?.historyCount ?? 0;
  const entCount = trace.l2?.entityCount ?? 0;
  const relCount = trace.l2?.relationCount ?? 0;

  return (
    <details className="text-[10px] text-slate-500 group">
      <summary className="inline-flex items-center gap-1.5 cursor-pointer hover:text-slate-700 list-none">
        <Sparkles className="w-3 h-3 text-amber-500" />
        <span className="font-medium">3-Layer</span>
        <span>·</span>
        <Database className="w-3 h-3" />
        <span>
          {memCount}m {sigCount > 0 && `${sigCount}s `} {histCount > 0 && `${histCount}h `}{entCount > 0 && `${entCount}e ${relCount}r`}
        </span>
        <span>·</span>
        <Clock className="w-3 h-3" />
        <span>{(trace.totalMs / 1000).toFixed(1)}s</span>
      </summary>
      <div className="mt-1.5 pl-4 space-y-1 border-l border-slate-200">
        {trace.l1 && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-amber-600">L1</span>
            <Brain className="w-3 h-3" />
            <span>Strategist · {trace.l1.ms}ms</span>
          </div>
        )}
        {trace.l2 && (
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-amber-600">L2</span>
              <Database className="w-3 h-3" />
              <span>
                Analyst · {memCount}mem · {sigCount}sig · {histCount}turn · {entCount}ent · {relCount}rel · {trace.l2.ms}ms
              </span>
            </div>
            {trace.l2.notes.length > 0 && (
              <div className="pl-5 mt-0.5 text-slate-400 italic">{trace.l2.notes.join(" · ")}</div>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="font-mono text-amber-600">L3</span>
          <Sparkles className="w-3 h-3" />
          <span>Synthesizer · {trace.l3.ms}ms</span>
        </div>
      </div>
    </details>
  );
}
