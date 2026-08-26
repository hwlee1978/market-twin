import { CountryMark } from "./CountryMark";

const R = 78;
const CX = 94;
const CY = 94;
const CIRC = 2 * Math.PI * R;

/**
 * 3-color SVG ring gauge (x.x/10) for the recommended market's
 * attractiveness score, with a secondary-market footer. Score is derived
 * on the page from countryStats[recommended].finalScore.mean / 10.
 */
export function AttractivenessGauge({
  locale,
  countryLabel,
  score,
  secondary,
}: {
  locale: string;
  countryLabel: string;
  score: number | null;
  secondary: {
    countryCode: string;
    countryLabel: string;
    score: number;
    gap: number;
  } | null;
}) {
  const isKo = locale === "ko";
  const S = isKo
    ? { eyebrow: "종합 시장 매력도", high: "높음 · High", mid: "보통 · Mid", low: "낮음 · Low", secondaryLabel: "차순위 시장", gap: (g: string) => `(격차 ${g})` }
    : { eyebrow: "Overall market fit", high: "High", mid: "Mid", low: "Low", secondaryLabel: "Runner-up market", gap: (g: string) => `(gap ${g})` };

  const clamped = score != null ? Math.max(0, Math.min(10, score)) : null;
  const dashLen = clamped != null ? (clamped / 10) * CIRC : 0;
  const tag = clamped == null ? null : clamped >= 7.5 ? S.high : clamped >= 5 ? S.mid : S.low;
  const tagColor =
    clamped == null
      ? { bg: "#f1f5f9", fg: "#64748b" }
      : clamped >= 7.5
        ? { bg: "#e7f7f1", fg: "#0d9c72" }
        : clamped >= 5
          ? { bg: "#fdf3e2", fg: "#c77c0a" }
          : { bg: "#fdeef1", fg: "#d64040" };

  return (
    <div className="card p-5 flex flex-col">
      <div className="mb-1">
        <div className="text-[11px] font-extrabold tracking-[.1em] uppercase text-slate-400">
          {S.eyebrow}
        </div>
        <h2 className="text-[15.5px] font-extrabold text-slate-900 mt-0.5">{countryLabel}</h2>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center py-1">
        <div className="relative w-[188px] h-[188px]">
          <svg viewBox="0 0 188 188" width={188} height={188}>
            <defs>
              <linearGradient id="mtAttractGaugeGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#06b6d4" />
                <stop offset=".5" stopColor="#3b82f6" />
                <stop offset="1" stopColor="#7c3aed" />
              </linearGradient>
            </defs>
            <circle cx={CX} cy={CY} r={R} fill="none" stroke="#eef2f8" strokeWidth={16} />
            {clamped != null && (
              <circle
                cx={CX}
                cy={CY}
                r={R}
                fill="none"
                stroke="url(#mtAttractGaugeGrad)"
                strokeWidth={16}
                strokeLinecap="round"
                strokeDasharray={`${dashLen} ${CIRC}`}
                transform={`rotate(-90 ${CX} ${CY})`}
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-[46px] font-extrabold text-slate-900 leading-none tabular-nums">
              {clamped != null ? clamped.toFixed(1) : "—"}
              <small className="text-[17px] text-slate-400 font-bold">/10</small>
            </div>
            {tag && (
              <div
                className="text-[11px] font-extrabold tracking-[.06em] uppercase mt-1.5 px-2.5 py-1 rounded-full"
                style={{ background: tagColor.bg, color: tagColor.fg }}
              >
                {tag}
              </div>
            )}
          </div>
        </div>
      </div>
      {secondary && (
        <div className="border-t border-slate-100 pt-3.5 mt-1 flex items-center justify-between gap-2.5">
          <span className="text-[11.5px] text-slate-400 font-bold">{S.secondaryLabel}</span>
          <span className="text-[13px] text-slate-900 font-extrabold flex items-center gap-1.5">
            <CountryMark code={secondary.countryCode} size="sm" />
            {secondary.countryLabel} · {secondary.score.toFixed(1)}
            <span className="text-[10.5px] font-extrabold text-amber-600">{S.gap(secondary.gap.toFixed(1))}</span>
          </span>
        </div>
      )}
    </div>
  );
}
