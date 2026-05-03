/**
 * Shared comparison primitives used by both same-project and cross-project
 * ensemble comparison pages. Extracted so the two pages don't drift apart
 * on visual / numeric details — they're presenting the same conceptual
 * comparison, just with different selectors and context above.
 */
import { ArrowLeft, ArrowRight, Minus } from "lucide-react";
import { CountryChip } from "@/components/ui/CountryChip";
import type { EnsembleAggregate } from "@/lib/simulation/ensemble";

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
      {children}
    </h2>
  );
}

export function TierBadge({ label }: { label: string }) {
  return (
    <span className="inline-block text-xs font-bold uppercase tracking-wider bg-brand/10 text-brand px-2 py-1 rounded">
      {label}
    </span>
  );
}

/**
 * Small (?) circle that shows a tooltip on hover. Reused across the
 * comparison cards so every metric can carry its own one-sentence
 * explanation without each card re-defining the styling.
 */
function HelpDot({ tooltip }: { tooltip: string }) {
  return (
    <span
      title={tooltip}
      className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-slate-200 text-slate-500 text-[10px] font-bold cursor-help shrink-0"
    >
      ?
    </span>
  );
}

export function CompareKpi({
  label,
  a,
  b,
  format,
  higherIsBetter,
  currency,
  tooltip,
}: {
  label: string;
  a: number | undefined;
  b: number | undefined;
  format: (v: number | undefined) => string;
  higherIsBetter?: boolean;
  currency?: string;
  tooltip?: string;
}) {
  const delta = a !== undefined && b !== undefined && a !== b ? b - a : undefined;
  const deltaSign =
    delta === undefined ? "flat" : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const tone =
    delta === undefined || higherIsBetter === undefined
      ? "neutral"
      : (higherIsBetter && deltaSign === "up") ||
          (!higherIsBetter && deltaSign === "down")
        ? "good"
        : deltaSign === "flat"
          ? "neutral"
          : "bad";
  return (
    <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/40">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
        <span>{label}</span>
        {tooltip && <HelpDot tooltip={tooltip} />}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm tabular-nums">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">A</div>
          <div className="font-mono text-slate-900">{format(a)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">B</div>
          <div className="font-mono text-slate-900">{format(b)}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs">
        <DeltaBadge sign={deltaSign} tone={tone} />
        {delta !== undefined && (
          <span className="text-slate-500 tabular-nums">
            Δ {delta > 0 ? "+" : ""}
            {currency ? delta.toFixed(2) : Math.round(delta)}
          </span>
        )}
      </div>
    </div>
  );
}

export function CompareInfo({
  label,
  a,
  b,
  tooltip,
}: {
  label: string;
  a: string | undefined;
  b: string | undefined;
  tooltip?: string;
}) {
  const same = a === b;
  return (
    <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/40">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
        <span>{label}</span>
        {tooltip && <HelpDot tooltip={tooltip} />}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">A</div>
          <div className="text-slate-900 font-medium">{a ?? "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">B</div>
          <div className="text-slate-900 font-medium">{b ?? "—"}</div>
        </div>
      </div>
      <div className="mt-2 text-xs text-slate-500">{same ? "—" : "≠"}</div>
    </div>
  );
}

export function DeltaBadge({
  sign,
  tone,
}: {
  sign: "up" | "down" | "flat";
  tone: "good" | "bad" | "neutral";
}) {
  const Icon = sign === "up" ? ArrowRight : sign === "down" ? ArrowLeft : Minus;
  const cls =
    tone === "good"
      ? "bg-success-soft text-success"
      : tone === "bad"
        ? "bg-risk-soft text-risk"
        : "bg-slate-100 text-slate-500";
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${cls}`}>
      <Icon
        size={11}
        className={
          sign === "up" ? "rotate-[-45deg]" : sign === "down" ? "rotate-[-135deg]" : ""
        }
      />
    </span>
  );
}

export function DistributionPanel({
  title,
  distribution,
  winner,
  simCount,
  locale,
}: {
  title: string;
  distribution: EnsembleAggregate["bestCountryDistribution"];
  winner?: string;
  simCount: number;
  locale: string;
}) {
  void locale;
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
        {title}
      </div>
      {distribution.length === 0 ? (
        <p className="text-xs text-slate-500">—</p>
      ) : (
        <div className="space-y-2">
          {distribution.map((b) => {
            const isWinner = b.country === winner;
            return (
              <div key={b.country} className="flex items-center gap-3 text-sm">
                <CountryChip code={b.country} size="sm" />
                <div className="w-10 font-medium text-slate-700">{b.country}</div>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${isWinner ? "bg-success" : "bg-slate-300"}`}
                    style={{ width: `${b.percent}%` }}
                  />
                </div>
                <div className="w-20 text-right text-xs text-slate-500 tabular-nums">
                  {b.count}/{simCount} ({b.percent}%)
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function RiskPanel({
  title,
  risks,
  isKo,
}: {
  title: string;
  risks: NonNullable<EnsembleAggregate["narrative"]>["mergedRisks"];
  isKo: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
        {title}
      </div>
      {risks.length === 0 ? (
        <p className="text-xs text-slate-500">—</p>
      ) : (
        <ul className="space-y-3">
          {risks.map((r, i) => {
            const sevClass =
              r.severity === "high"
                ? "text-risk"
                : r.severity === "medium"
                  ? "text-warn"
                  : "text-slate-500";
            return (
              <li key={i} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <span className={`text-[10px] font-bold uppercase ${sevClass}`}>
                    {r.severity}
                  </span>
                  <span className="font-semibold text-slate-900">{r.factor}</span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{r.description}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {isKo
                    ? `${r.surfacedInSims}개 시뮬에서 언급`
                    : `Surfaced in ${r.surfacedInSims} sim${r.surfacedInSims === 1 ? "" : "s"}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ActionPanel({
  title,
  actions,
  isKo,
}: {
  title: string;
  actions: NonNullable<EnsembleAggregate["narrative"]>["mergedActions"];
  isKo: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
        {title}
      </div>
      {actions.length === 0 ? (
        <p className="text-xs text-slate-500">—</p>
      ) : (
        <ol className="space-y-3">
          {actions.map((a, i) => (
            <li key={i} className="text-sm flex gap-2">
              <span className="text-brand font-bold shrink-0">{i + 1}.</span>
              <div className="min-w-0">
                <p className="text-slate-700 leading-relaxed">{a.action}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {isKo
                    ? `${a.surfacedInSims}개 시뮬에서 권장`
                    : `Recommended by ${a.surfacedInSims} sim${a.surfacedInSims === 1 ? "" : "s"}`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
