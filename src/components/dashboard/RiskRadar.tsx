export interface RiskRow {
  factor: string;
  description: string;
  severity: "low" | "medium" | "high";
  surfacedInSims: number;
  simCount: number;
  scopeLabel: string | null;
}

const SEV_BAR = { high: "#ef4444", medium: "#f59e0b", low: "#94a3b8" };
const SEV_TAG = {
  high: "bg-risk-soft text-[#d64040]",
  medium: "bg-warn-soft text-[#c77c0a]",
  low: "bg-slate-100 text-slate-400",
};

export function RiskRadar({
  locale,
  overallLevel,
  risks,
}: {
  locale: string;
  overallLevel: "low" | "medium" | "high" | null;
  risks: RiskRow[];
}) {
  const isKo = locale === "ko";
  const S = isKo
    ? {
        eyebrow: "리스크 레이더",
        title: (n: number) => `주요 리스크 ${n}건`,
        sevLabel: { high: "높음", medium: "중간", low: "낮음" },
        overall: { high: "전체 리스크 HIGH", medium: "전체 리스크 MEDIUM", low: "전체 리스크 LOW" },
        surfaced: (n: number, total: number) => `${total}개 중 ${n}개 시뮬에서 언급`,
      }
    : {
        eyebrow: "Risk radar",
        title: (n: number) => `Top ${n} risks`,
        sevLabel: { high: "High", medium: "Medium", low: "Low" },
        overall: { high: "Overall risk HIGH", medium: "Overall risk MEDIUM", low: "Overall risk LOW" },
        surfaced: (n: number, total: number) => `Surfaced in ${n}/${total} sims`,
      };

  const overallStyle =
    overallLevel === "high"
      ? "bg-risk-soft text-[#d64040]"
      : overallLevel === "low"
        ? "bg-success-soft text-[#0d9c72]"
        : "bg-warn-soft text-[#c77c0a]";

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-[11px] font-extrabold tracking-[.1em] uppercase text-slate-400">
            {S.eyebrow}
          </div>
          <h2 className="text-[15.5px] font-extrabold text-slate-900 mt-0.5">{S.title(risks.length)}</h2>
        </div>
        {overallLevel && (
          <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-full shrink-0 ${overallStyle}`}>
            {S.overall[overallLevel]}
          </span>
        )}
      </div>
      {risks.map((r, i) => (
        <div
          key={`${r.factor}-${i}`}
          className="flex gap-3 py-3 border-b border-slate-100 last:border-b-0 last:pb-0 first:pt-0"
        >
          <div
            className="w-[5px] rounded-md shrink-0"
            style={{ background: SEV_BAR[r.severity] }}
          />
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-bold text-slate-900 flex items-center gap-2 flex-wrap">
              {r.factor}
              <span className={`text-[9.5px] font-extrabold px-1.5 py-0.5 rounded-full tracking-[.04em] ${SEV_TAG[r.severity]}`}>
                {S.sevLabel[r.severity]}
              </span>
            </div>
            <div className="text-[11.5px] text-slate-400 mt-[3px] leading-[1.45]">{r.description}</div>
            <div className="text-[10.5px] text-slate-300 font-semibold mt-1">
              {S.surfaced(r.surfacedInSims, r.simCount)}
              {r.scopeLabel ? ` · ${r.scopeLabel}` : ""}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
