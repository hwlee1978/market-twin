import { clsx } from "clsx";

const STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  ready: "bg-blue-100 text-blue-700",
  running: "bg-purple-100 text-purple-700",
  completed: "bg-success-soft text-success",
  failed: "bg-risk-soft text-risk",
  archived: "bg-slate-100 text-slate-500",
  pending: "bg-warn-soft text-warn",
  cancelled: "bg-slate-100 text-slate-500",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={clsx("badge", STYLES[status] ?? "bg-slate-100 text-slate-700")}>
      {label ?? status}
    </span>
  );
}
