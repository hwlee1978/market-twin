"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { scoreDescription } from "@/lib/description-strength";

/**
 * Live nudge for the wizard's product-description field.
 *
 * Why: K-Beauty D2C benchmark (2026-06-03) showed descriptions with
 * concrete channel / audience / geography signals predict the right
 * market significantly better than vague positioning. See:
 *   - proposals/K-Beauty-D2C-Comprehensive-Report.md §4.7
 *
 * What: heuristic 0-100 score across 6 buckets (length, channel,
 * demographic, audience signal, geography, price tier) with per-bucket
 * tips when a bucket is missing. Not a hard gate — purely informational.
 *
 * Renders compact when score ≥ 80, expanded with tips otherwise. Hidden
 * entirely when text < 30 chars (don't pester the user mid-typing).
 */
export function DescriptionStrengthHint({ text }: { text: string }) {
  const tw = useTranslations("project.wizard.descriptionStrength");
  const result = useMemo(() => scoreDescription(text), [text]);
  if (text.trim().length < 30) return null;

  const score = result.score;
  const tone =
    score >= 80
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : score >= 50
      ? "text-amber-700 bg-amber-50 border-amber-200"
      : "text-rose-700 bg-rose-50 border-rose-200";
  const dotTone =
    score >= 80
      ? "bg-emerald-500"
      : score >= 50
      ? "bg-amber-500"
      : "bg-rose-500";

  const failedBuckets = result.buckets.filter((b) => !b.passed);

  return (
    <div className={`mt-2 text-xs border rounded-md px-3 py-2 ${tone}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`inline-block w-2 h-2 rounded-full ${dotTone}`} />
        <strong>{tw("title")}</strong>
        <span className="ml-auto font-mono">{score}/100</span>
      </div>
      <div className="flex h-1.5 rounded-full bg-white/60 overflow-hidden mb-2">
        <div
          className={`h-full ${
            score >= 80
              ? "bg-emerald-500"
              : score >= 50
              ? "bg-amber-500"
              : "bg-rose-500"
          }`}
          style={{ width: `${score}%` }}
        />
      </div>
      {failedBuckets.length > 0 && score < 80 && (
        <div className="space-y-0.5 mt-1">
          <div className="opacity-80">{tw("tipsHeader")}</div>
          <ul className="list-disc pl-4 space-y-0.5">
            {failedBuckets.slice(0, 3).map((b) => (
              <li key={b.key}>{tw(`tips.${b.key}`)}</li>
            ))}
          </ul>
        </div>
      )}
      {score >= 80 && (
        <div className="opacity-80">
          {tw("strong")}
        </div>
      )}
    </div>
  );
}
