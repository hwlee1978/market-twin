const R = 46;
const CX = 60;
const CY = 60;
const CIRC = 2 * Math.PI * R;

export interface ProviderLegendRow {
  name: string;
  color: string;
  simCount: number;
  topCountryLabel: string | null;
  topPercent: number | null;
}

const CONFIDENCE_COLOR: Record<"STRONG" | "MODERATE" | "WEAK", string> = {
  STRONG: "#0d9c72",
  MODERATE: "#c77c0a",
  WEAK: "#d64040",
};

/**
 * Cross-model consensus donut + provider legend. Only rendered by the
 * caller when aggregate.providerBreakdown is present (multi-provider
 * ensembles) — single-provider runs have nothing meaningful to show here.
 */
export function EnsembleConsensus({
  locale,
  consensusPercent,
  countryLabel,
  providers,
  confidence,
}: {
  locale: string;
  consensusPercent: number | null;
  countryLabel: string;
  providers: ProviderLegendRow[];
  confidence: "STRONG" | "MODERATE" | "WEAK" | null;
}) {
  const isKo = locale === "ko";
  const S = isKo
    ? {
        eyebrow: "AI 앙상블 합의",
        title: "모델별 추천 분포",
        consensusOf: (c: string) => `${c} 합의`,
        crossModel: "교차모델 합의",
        mixed: "혼합",
      }
    : {
        eyebrow: "AI ensemble consensus",
        title: "Per-model pick distribution",
        consensusOf: (c: string) => `${c} consensus`,
        crossModel: "Cross-model agreement",
        mixed: "Mixed",
      };

  const totalSims = providers.reduce((a, p) => a + p.simCount, 0);
  const segments = providers.reduce<Array<{ color: string; len: number; offset: number }>>(
    (acc, p) => {
      const len = totalSims > 0 ? (p.simCount / totalSims) * CIRC : 0;
      const runningOffset = acc.length > 0 ? acc[acc.length - 1].offset - acc[acc.length - 1].len : 0;
      acc.push({ color: p.color, len, offset: runningOffset });
      return acc;
    },
    [],
  );

  return (
    <div className="card p-5">
      <div className="mb-4">
        <div className="text-[11px] font-extrabold tracking-[.1em] uppercase text-slate-400">
          {S.eyebrow}
        </div>
        <h2 className="text-[15.5px] font-extrabold text-slate-900 mt-0.5">{S.title}</h2>
      </div>
      <div className="flex items-center gap-5">
        <div className="relative w-[130px] h-[130px] shrink-0">
          <svg viewBox="0 0 120 120" width={130} height={130}>
            <circle cx={CX} cy={CY} r={R} fill="none" stroke="#eef2f8" strokeWidth={16} />
            {segments.map((seg, i) => (
              <circle
                key={i}
                cx={CX}
                cy={CY}
                r={R}
                fill="none"
                stroke={seg.color}
                strokeWidth={16}
                strokeDasharray={`${seg.len} ${CIRC - seg.len}`}
                strokeDashoffset={seg.offset}
                transform={`rotate(-90 ${CX} ${CY})`}
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <b className="text-[22px] font-extrabold text-slate-900 leading-none tabular-nums">
              {consensusPercent != null ? `${consensusPercent}%` : "—"}
            </b>
            <span className="text-[10px] text-slate-400 font-bold mt-0.5">
              {S.consensusOf(countryLabel)}
            </span>
          </div>
        </div>
        <div className="flex-1 flex flex-col gap-2.5 min-w-0">
          {providers.map((p) => (
            <div key={p.name} className="flex items-center gap-2.5 text-[12.5px] min-w-0">
              <span className="w-[11px] h-[11px] rounded-[4px] shrink-0" style={{ background: p.color }} />
              <b className="text-slate-900 font-bold truncate">{p.name}</b>
              <span className="ml-auto text-[11px] font-extrabold text-slate-500 shrink-0">
                {p.topCountryLabel
                  ? `${p.topCountryLabel} · ${p.topPercent != null ? `${p.topPercent}%` : S.mixed}`
                  : "—"}
              </span>
            </div>
          ))}
          {confidence && (
            <div className="flex items-center gap-2.5 text-[12.5px] mt-1 border-t border-slate-100 pt-[11px]">
              <span
                className="w-[11px] h-[11px] rounded-[4px] shrink-0"
                style={{ background: CONFIDENCE_COLOR[confidence] }}
              />
              <b className="text-slate-900 font-bold">{S.crossModel}</b>
              <span
                className="ml-auto text-[11px] font-extrabold shrink-0"
                style={{ color: CONFIDENCE_COLOR[confidence] }}
              >
                {confidence}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
