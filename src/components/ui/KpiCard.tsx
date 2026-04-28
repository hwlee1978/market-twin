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
    <div className="card p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={clsx("mt-2 text-3xl font-semibold tabular-nums", toneCls)}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}
