"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown, CheckCircle2, X } from "lucide-react";

export type FeedbackKind = "useful" | "not_useful" | "acted" | "dismiss";
export type FeedbackTargetType = "briefing" | "chat_message";

const ICONS: Record<FeedbackKind, typeof ThumbsUp> = {
  useful: ThumbsUp,
  not_useful: ThumbsDown,
  acted: CheckCircle2,
  dismiss: X,
};

const COLORS: Record<FeedbackKind, string> = {
  useful: "text-emerald-600 bg-emerald-50 border-emerald-200",
  not_useful: "text-amber-700 bg-amber-50 border-amber-200",
  acted: "text-sky-600 bg-sky-50 border-sky-200",
  dismiss: "text-slate-500 bg-slate-100 border-slate-300",
};

const LABELS_KO: Record<FeedbackKind, string> = {
  useful: "유용",
  not_useful: "별로",
  acted: "실행",
  dismiss: "무시",
};
const LABELS_EN: Record<FeedbackKind, string> = {
  useful: "useful",
  not_useful: "not useful",
  acted: "acted",
  dismiss: "dismiss",
};

/**
 * Inline feedback button row. Toggleable — clicking the active kind
 * clears it. Optimistic: sets local state immediately, fires the POST
 * in background; on error reverts and logs.
 */
export function FeedbackButtons({
  targetType,
  targetId,
  initialKind = null,
  locale = "ko",
  size = "sm",
}: {
  targetType: FeedbackTargetType;
  targetId: string;
  initialKind?: FeedbackKind | null;
  locale?: "ko" | "en";
  size?: "sm" | "xs";
}) {
  const [active, setActive] = useState<FeedbackKind | null>(initialKind);
  const labels = locale === "en" ? LABELS_EN : LABELS_KO;

  const kinds: FeedbackKind[] = ["useful", "not_useful", "acted", "dismiss"];

  async function click(kind: FeedbackKind) {
    const next = active === kind ? null : kind;
    const prev = active;
    setActive(next); // optimistic

    try {
      const res = await fetch("/api/mrai/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetType, targetId, kind: next }),
      });
      if (!res.ok) throw new Error(`feedback ${res.status}`);
    } catch (e) {
      console.error("[mrai] feedback save failed; reverting", e);
      setActive(prev);
    }
  }

  const iconSize = size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5";
  const padding = size === "xs" ? "px-1.5 py-0.5" : "px-2 py-1";
  const textSize = size === "xs" ? "text-[10px]" : "text-xs";

  return (
    <div className="inline-flex items-center gap-1">
      {kinds.map((k) => {
        const Icon = ICONS[k];
        const isActive = active === k;
        return (
          <button
            key={k}
            onClick={() => click(k)}
            className={`inline-flex items-center gap-1 ${padding} ${textSize} border rounded-md transition-colors ${
              isActive
                ? COLORS[k]
                : "text-slate-400 bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-600"
            }`}
            title={labels[k]}
          >
            <Icon className={iconSize} />
            {size !== "xs" && <span>{labels[k]}</span>}
          </button>
        );
      })}
    </div>
  );
}
