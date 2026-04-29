import { clsx } from "clsx";

interface Props {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "success" | "warn" | "risk";
}

export function KpiCard({ label, value, hint, tone = "default" }: Props) {
  const toneCls = {
    default: "text-slate-900",
    success: "text-success",
    warn: "text-warn",
    risk: "text-risk",
  }[tone];

  return (
    <div className="card p-6">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className={clsx("mt-3 text-3xl font-semibold tabular-nums leading-none", toneCls)}>
        {value}
      </div>
      {hint && <div className="mt-2 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}
