import { clsx } from "clsx";

interface Props {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "success" | "warn" | "risk";
}

/**
 * KPI card optimized for short numeric / single-word values like "68%",
 * "MEDIUM", or "United States". When the result page hands it a long
 * Korean prose value (best segment description, sometimes 50+ chars),
 * the default text-3xl + leading-none renders enormous and ugly. We
 * detect that case and switch to a smaller, justified multi-line
 * layout — the card becomes a small description block instead of a
 * KPI tile.
 */
export function KpiCard({ label, value, hint, tone = "default" }: Props) {
  const toneCls = {
    default: "text-slate-900",
    success: "text-success",
    warn: "text-warn",
    risk: "text-risk",
  }[tone];

  // Heuristic: more than 18 characters suggests a sentence rather than a
  // headline metric. Switch to body-sized prose with justified alignment.
  const isLongText = typeof value === "string" && value.length > 18;

  return (
    <div className="card p-6">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div
        className={clsx(
          "mt-3 font-semibold",
          toneCls,
          isLongText
            ? "text-sm leading-relaxed text-justify"
            : "text-3xl tabular-nums leading-none",
        )}
        style={isLongText ? { textJustify: "inter-character" } : undefined}
      >
        {value}
      </div>
      {hint && <div className="mt-2 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}
