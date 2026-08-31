import { Layers, Users, Globe2, ShieldCheck, type LucideIcon } from "lucide-react";

const GRADIENTS = [
  "linear-gradient(140deg,#4f46e5,#6d5cf0)",
  "linear-gradient(140deg,#0891b2,#06b6d4)",
  "linear-gradient(140deg,#0d9c72,#10b981)",
  "linear-gradient(140deg,#d97706,#f59e0b)",
];

// Decorative only — the dashboard's KpiTiles uses the same waves. No
// fabricated trend is implied; a report has no historical series.
const SPARK_PATHS = [
  "M0 26 40 22 80 24 120 14 160 16 200 6",
  "M0 24 40 26 80 18 120 20 160 12 200 10",
  "M0 28 40 24 80 20 120 18 160 12 200 8",
  "M0 22 40 20 80 22 120 14 160 16 200 9",
];

/**
 * Run-summary tiles for the results Summary tab — the dashboard's KPI-tile
 * language applied to a single ensemble. Replaces the old flat "실행 요약"
 * grid so the report opens with the same visual weight as the dashboard.
 *
 * The fourth tile is grounding coverage / confidence when the quality block
 * exists, because that is the number that qualifies everything above it; it
 * falls back to the completed-sims ratio when it doesn't.
 */
export function RunMetaTiles({
  isKo,
  simCount,
  parallelSims,
  effectivePersonas,
  marketCount,
  confidenceScore,
  tierLabel,
  providersLabel,
  completedLabel,
}: {
  isKo: boolean;
  simCount: number;
  parallelSims: number;
  effectivePersonas: number;
  marketCount: number;
  confidenceScore?: number | null;
  tierLabel: string;
  providersLabel: string;
  completedLabel: string;
}) {
  const successRate = parallelSims > 0 ? Math.round((simCount / parallelSims) * 100) : 0;

  const items: Array<{
    icon: LucideIcon;
    value: string;
    suffix?: string;
    label: string;
  }> = [
    {
      icon: Layers,
      value: String(simCount),
      suffix: parallelSims > simCount ? `/${parallelSims}` : undefined,
      label: isKo ? "완료 시뮬레이션" : "Completed sims",
    },
    {
      icon: Users,
      value: effectivePersonas.toLocaleString(),
      label: isKo ? "유효 페르소나" : "Effective personas",
    },
    {
      icon: Globe2,
      value: String(marketCount),
      suffix: isKo ? "개국" : undefined,
      label: isKo ? "검증한 시장" : "Markets tested",
    },
    confidenceScore != null
      ? {
          icon: ShieldCheck,
          value: String(Math.round(confidenceScore)),
          suffix: isKo ? "점" : "pt",
          label: isKo ? "데이터 신뢰도" : "Data confidence",
        }
      : {
          icon: ShieldCheck,
          value: String(successRate),
          suffix: "%",
          label: isKo ? "시뮬 성공률" : "Sim success rate",
        },
  ];

  return (
    <section>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {items.map((it, i) => (
          <div
            key={it.label}
            className="relative overflow-hidden rounded-2xl p-[18px] text-white shadow-card"
            style={{ background: GRADIENTS[i] }}
          >
            <div
              className="w-[34px] h-[34px] rounded-xl flex items-center justify-center mb-3"
              style={{ background: "rgba(255,255,255,.2)" }}
            >
              <it.icon size={18} />
            </div>
            <div className="text-[26px] font-extrabold leading-none tabular-nums">
              {it.value}
              {it.suffix && (
                <small className="text-[14px] font-bold opacity-80 ml-0.5">{it.suffix}</small>
              )}
            </div>
            <div className="mt-[7px] text-[12px] font-semibold text-white/90">{it.label}</div>
            <svg
              className="absolute bottom-0 left-0 right-0 h-[30px] opacity-50 pointer-events-none"
              viewBox="0 0 200 34"
              preserveAspectRatio="none"
            >
              <path d={SPARK_PATHS[i]} fill="none" stroke="#fff" strokeWidth={2.5} />
            </svg>
          </div>
        ))}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11.5px] font-semibold text-slate-400">
        <span>{tierLabel}</span>
        {providersLabel && (
          <>
            <span>·</span>
            <span>{providersLabel}</span>
          </>
        )}
        <span>·</span>
        <span>{completedLabel}</span>
      </div>
    </section>
  );
}
