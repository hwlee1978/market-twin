"use client";

import type { Risk } from "@/lib/simulation/schemas";
import { clsx } from "clsx";

export function RisksTab({ risks }: { risks: Risk[] }) {
  if (risks.length === 0) {
    return (
      <div className="card text-center text-slate-500 text-sm">
        No significant risks flagged.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {risks.map((r, i) => (
        <div key={i} className="card flex items-start gap-5">
          <span
            className={clsx(
              "badge mt-0.5 shrink-0",
              r.severity === "high"
                ? "bg-risk-soft text-risk"
                : r.severity === "medium"
                  ? "bg-warn-soft text-warn"
                  : "bg-success-soft text-success",
            )}
          >
            {r.severity.toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-slate-900">{r.factor}</div>
            <p className="prose-body mt-2">{r.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
