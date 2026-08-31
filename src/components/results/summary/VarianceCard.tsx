import type { ReactNode } from "react";
import { Activity } from "lucide-react";

type VarianceLabel = "low" | "moderate" | "high";

const STYLE: Record<
  VarianceLabel,
  { ring: string; chipBg: string; chipFg: string; bar: string; fill: number }
> = {
  // `fill` is the share of the track drawn — a fixed illustration of where
  // this label sits on the low→high axis, not a measured value.
  low: {
    ring: "#10b981",
    chipBg: "var(--color-success-soft)",
    chipFg: "var(--color-success)",
    bar: "linear-gradient(90deg,#0d9c72,#10b981)",
    fill: 28,
  },
  moderate: {
    ring: "#f59e0b",
    chipBg: "var(--color-warn-soft)",
    chipFg: "var(--color-warn)",
    bar: "linear-gradient(90deg,#d97706,#f59e0b)",
    fill: 62,
  },
  high: {
    ring: "#f43f5e",
    chipBg: "rgba(244,63,94,.14)",
    chipFg: "#e11d48",
    bar: "linear-gradient(90deg,#e11d48,#fb7185)",
    fill: 92,
  },
};

/**
 * Variance assessment — how much country scores moved between the
 * independent sims. Same card shell as the dashboard's metric blocks; the
 * explanation drawer (ChartGuide) is passed in as a child so this component
 * stays free of the results-page-specific guide plumbing.
 */
export function VarianceCard({
  label,
  copy,
  maxRange,
  meanRange,
  isKo,
  guide,
}: {
  label: VarianceLabel;
  copy: string;
  maxRange: number;
  meanRange: number;
  isKo: boolean;
  guide?: ReactNode;
}) {
  const s = STYLE[label];
  const labelText = isKo
    ? label === "low"
      ? "낮음"
      : label === "moderate"
        ? "보통"
        : "높음"
    : label.toUpperCase();

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex items-start gap-3.5">
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white"
          style={{ background: `linear-gradient(150deg, ${s.ring}, ${s.ring}bb)` }}
        >
          <Activity size={18} strokeWidth={2.4} />
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[15px] font-extrabold text-slate-900 tracking-tight">
              {isKo ? "변동성 평가" : "Variance assessment"}
            </h3>
            <span
              className="rounded-full px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide"
              style={{ background: s.chipBg, color: s.chipFg }}
            >
              {labelText}
            </span>
          </div>

          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">{copy}</p>

          <div className="mt-3.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${s.fill}%`, background: s.bar }} />
          </div>
          <div className="mt-1 flex justify-between text-[10.5px] font-semibold text-slate-400">
            <span>{isKo ? "일관됨" : "Consistent"}</span>
            <span>{isKo ? "흔들림" : "Volatile"}</span>
          </div>

          <div className="mt-3.5 grid grid-cols-2 gap-2.5">
            <Stat
              label={isKo ? "최대 점수 변동" : "Max score range"}
              value={maxRange}
              isKo={isKo}
            />
            <Stat
              label={isKo ? "평균 변동" : "Mean range"}
              value={meanRange}
              isKo={isKo}
            />
          </div>

          {guide && <div className="mt-3">{guide}</div>}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, isKo }: { label: string; value: number; isKo: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3.5 py-2.5">
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 truncate">
        {label}
      </div>
      <div className="mt-0.5 text-[17px] font-extrabold tabular-nums text-slate-800">
        {value}
        <small className="ml-0.5 text-[12px] font-bold text-slate-400">
          {isKo ? "점" : "pt"}
        </small>
      </div>
    </div>
  );
}
