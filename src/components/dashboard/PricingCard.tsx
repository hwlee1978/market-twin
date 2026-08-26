import { Sparkles } from "lucide-react";

/**
 * Recommended-price hero + position-track gauge. All price fields are cents
 * in the project's own currency (matches packages/shared/src/format/price.ts
 * convention) — caller passes already-formatted strings so this component
 * has no currency-formatting logic of its own.
 */
export function PricingCard({
  locale,
  recommendedLabel,
  lowLabel,
  highLabel,
  markerPct,
  marginPct,
}: {
  locale: string;
  recommendedLabel: string;
  lowLabel: string;
  highLabel: string;
  /** 0-100 position of the recommended price within [low, high]. */
  markerPct: number;
  marginPct: number | null;
}) {
  const isKo = locale === "ko";
  const S = isKo
    ? {
        eyebrow: "추천 가격",
        title: "최적 가격대",
        sub: "전환·수익 최적 구간",
        ideal: "이상적",
        note: (m: number) => `시뮬레이션 앙상블이 수렴한 구간입니다. 예상 마진 ${m}%.`,
        noteNoMargin: "시뮬레이션 앙상블이 수렴한 최적 가격 구간입니다.",
      }
    : {
        eyebrow: "Recommended price",
        title: "Optimal price point",
        sub: "Conversion / margin sweet spot",
        ideal: "Ideal",
        note: (m: number) => `Converged across the simulation ensemble. Estimated margin ${m}%.`,
        noteNoMargin: "Converged optimal range across the simulation ensemble.",
      };

  const clampedMarker = Math.max(0, Math.min(100, markerPct));

  return (
    <div className="card p-5">
      <div className="mb-1">
        <div className="text-[11px] font-extrabold tracking-[.1em] uppercase text-slate-400">
          {S.eyebrow}
        </div>
        <h2 className="text-[15.5px] font-extrabold text-slate-900 mt-0.5">{S.title}</h2>
      </div>
      <div className="text-center py-1.5 pb-4">
        <div className="text-[11.5px] text-slate-400 font-bold">{S.sub}</div>
        <div className="text-[30px] font-extrabold text-slate-900 mt-1.5 tabular-nums">
          {recommendedLabel}
        </div>
      </div>
      <div
        className="relative h-2.5 rounded-full mx-1 mt-[34px] mb-2"
        style={{
          background:
            "linear-gradient(90deg,#93c5fd,#34d399 45%,#34d399 62%,#fbbf24 85%,#fb7185)",
        }}
      >
        <div
          className="absolute top-1/2 w-5 h-5 rounded-full bg-white border-[3px] shrink-0"
          style={{
            left: `${clampedMarker}%`,
            transform: "translate(-50%,-50%)",
            borderColor: "#10b981",
            boxShadow: "0 3px 8px rgba(15,42,91,.25)",
          }}
        >
          <span
            className="absolute -top-[30px] left-1/2 -translate-x-1/2 text-white text-[10.5px] font-extrabold px-2.5 py-1 rounded-[7px] whitespace-nowrap"
            style={{ background: "#10b981" }}
          >
            {S.ideal}
          </span>
        </div>
      </div>
      <div className="flex justify-between text-[10.5px] text-slate-400 font-bold px-0.5">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
      <div className="mt-4 text-[11.5px] text-slate-700 bg-success-soft rounded-[10px] p-3 flex gap-2 items-start">
        <Sparkles size={15} className="text-[#0d9c72] shrink-0 mt-0.5" />
        <span>{marginPct != null ? S.note(Math.round(marginPct)) : S.noteNoMargin}</span>
      </div>
    </div>
  );
}
