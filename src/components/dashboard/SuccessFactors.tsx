import { BarChart3, TrendingUp, Globe2, Layers, DollarSign, Shield, type LucideIcon } from "lucide-react";

export interface FactorRow {
  key: "marketSize" | "culturalFit" | "channelMatch" | "priceCompat" | "competition" | "regulatory";
  value: number; // 0-100
}

const META: Record<
  FactorRow["key"],
  { icon: LucideIcon; color: string; labelKo: string; labelEn: string }
> = {
  marketSize: { icon: BarChart3, color: "#4f46e5", labelKo: "시장 규모", labelEn: "Market size" },
  culturalFit: { icon: Globe2, color: "#f59e0b", labelKo: "문화 적합도", labelEn: "Cultural fit" },
  channelMatch: { icon: Layers, color: "#10b981", labelKo: "채널 적합성", labelEn: "Channel match" },
  priceCompat: { icon: DollarSign, color: "#f43f5e", labelKo: "가격 적합도", labelEn: "Price compatibility" },
  competition: { icon: TrendingUp, color: "#06b6d4", labelKo: "경쟁 강도", labelEn: "Competitive edge" },
  regulatory: { icon: Shield, color: "#1e4d8f", labelKo: "규제 안정성", labelEn: "Regulatory stability" },
};

function level(value: number): "high" | "mid" | "low" {
  if (value >= 75) return "high";
  if (value >= 55) return "mid";
  return "low";
}

const LEVEL_STYLE = {
  high: { pill: "bg-success-soft text-[#0d9c72]", fill: "linear-gradient(90deg,#10b981,#34d399)" },
  mid: { pill: "bg-warn-soft text-[#c77c0a]", fill: "linear-gradient(90deg,#f59e0b,#fbbf24)" },
  low: { pill: "bg-risk-soft text-[#d64040]", fill: "linear-gradient(90deg,#f43f5e,#fb7185)" },
};

export function SuccessFactors({
  locale,
  countryLabel,
  factors,
}: {
  locale: string;
  countryLabel: string;
  factors: FactorRow[];
}) {
  const isKo = locale === "ko";
  const S = isKo
    ? { eyebrow: "핵심 성공 요인", title: (c: string) => `${c} · ${factors.length}개 지표`, high: "HIGH", mid: "MID", low: "LOW" }
    : { eyebrow: "Key success factors", title: (c: string) => `${c} · ${factors.length} metrics`, high: "HIGH", mid: "MID", low: "LOW" };

  return (
    <div className="card p-5">
      <div className="mb-4">
        <div className="text-[11px] font-extrabold tracking-[.1em] uppercase text-slate-400">
          {S.eyebrow}
        </div>
        <h2 className="text-[15.5px] font-extrabold text-slate-900 mt-0.5">{S.title(countryLabel)}</h2>
      </div>
      {factors.map((f) => {
        const meta = META[f.key];
        const lvl = level(f.value);
        const style = LEVEL_STYLE[lvl];
        const lvlLabel = lvl === "high" ? S.high : lvl === "mid" ? S.mid : S.low;
        return (
          <div
            key={f.key}
            className="grid grid-cols-[140px_1fr_auto] items-center gap-3.5 py-2.5 border-b border-slate-100 last:border-b-0 last:pb-0 first:pt-0"
          >
            <div className="flex items-center gap-2.5 text-[12.5px] font-bold text-slate-900 min-w-0">
              <span
                className="w-7 h-7 rounded-lg grid place-items-center text-white shrink-0"
                style={{ background: meta.color }}
              >
                <meta.icon size={15} />
              </span>
              <span className="truncate">{isKo ? meta.labelKo : meta.labelEn}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(0, Math.min(100, f.value))}%`, background: style.fill }}
              />
            </div>
            <span
              className={`text-[10.5px] font-extrabold px-2.5 py-1 rounded-full min-w-[62px] text-center ${style.pill}`}
            >
              {lvlLabel} · {Math.round(f.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
