"use client";

import type { Risk } from "@/lib/simulation/schemas";
import { clsx } from "clsx";

export function RisksTab({ risks }: { risks: Risk[] }) {
  if (risks.length === 0) {
    return <div className="card text-center text-slate-500 text-sm">No significant risks flagged.</div>;
  }
  return (
    <div className="space-y-3">
      {risks.map((r, i) => (
        <div key={i} className="card flex items-start gap-4">
          <span
            className={clsx(
              "badge mt-1",
              r.severity === "high"
                ? "bg-risk-soft text-risk"
                : r.severity === "medium"
                  ? "bg-warn-soft text-warn"
                  : "bg-success-soft text-success",
            )}
          >
            {r.severity.toUpperCase()}
          </span>
          <div>
            <div className="font-medium text-slate-900">{r.factor}</div>
            <p className="text-sm text-slate-600 mt-1">{r.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
