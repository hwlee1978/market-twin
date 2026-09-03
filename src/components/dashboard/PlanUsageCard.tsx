import { Link } from "@/i18n/navigation";
import { ArrowRight, Gauge } from "lucide-react";

/**
 * Plan and quota at a glance, on the first screen after login.
 *
 * The full billing view lives at /billing; this is the summary a user wants
 * without navigating — which plan they are on and how much of it is left.
 * Quota rules are read from the same resolved subscription the billing page
 * uses, so the two can't drift.
 *
 * Only meters the plan actually includes are rendered: showing "Consensus
 * Plus 0/0" to a Starter workspace is noise, not information.
 */

export interface PlanUsageMeter {
  label: string;
  used: number;
  /** -1 means unlimited, mirroring the plan-limit convention. */
  limit: number;
  color: string;
}

export function PlanUsageCard({
  planName,
  statusLabel,
  statusTone,
  meters,
  resetLabel,
  manageLabel,
  title,
}: {
  planName: string;
  statusLabel: string | null;
  statusTone: "neutral" | "warn" | "risk";
  meters: PlanUsageMeter[];
  resetLabel: string | null;
  manageLabel: string;
  title: string;
}) {
  const toneClass =
    statusTone === "risk"
      ? "bg-rose-50 text-rose-700"
      : statusTone === "warn"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-600";

  return (
    <div className="card p-5 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 bg-brand">
            <Gauge size={14} strokeWidth={2.4} />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              {title}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-slate-900 truncate">
                {planName}
              </span>
              {statusLabel ? (
                <span className={`badge ${toneClass}`}>{statusLabel}</span>
              ) : null}
            </div>
          </div>
        </div>

        <Link
          href="/billing"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline shrink-0"
        >
          {manageLabel}
          <ArrowRight size={14} />
        </Link>
      </div>

      {/* Flex-wrap with a bounded width per meter rather than a grid: the card
          spans the full dashboard, and a 2-column grid stretched each meter to
          ~700px, leaving the label and its number at opposite ends of the
          screen. This keeps them readable whether the plan has two meters or
          four. */}
      {meters.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3.5">
          {meters.map((m) => (
            <div key={m.label} className="flex-1 min-w-[170px] max-w-[280px]">
              <Meter {...m} />
            </div>
          ))}
        </div>
      ) : null}

      {resetLabel ? (
        <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
          {resetLabel}
        </div>
      ) : null}
    </div>
  );
}

function Meter({ label, used, limit, color }: PlanUsageMeter) {
  const unlimited = limit < 0;
  // A zero limit would divide by zero and, more usefully, means the plan does
  // not include this at all — render it as full so it reads as unavailable
  // rather than as untouched headroom.
  const pct = unlimited ? 0 : limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  const exhausted = !unlimited && used >= limit;
  const nearly = !unlimited && !exhausted && pct >= 80;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-xs text-slate-600 truncate">{label}</span>
        <span className="text-xs font-semibold text-slate-900 tabular-nums shrink-0">
          {used}
          <span className="text-slate-400 font-normal"> / {unlimited ? "∞" : limit}</span>
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${unlimited ? 4 : pct}%`,
            background: exhausted ? "#e11d48" : nearly ? "#d97706" : color,
          }}
        />
      </div>
    </div>
  );
}
