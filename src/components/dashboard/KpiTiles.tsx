import { Compass, TrendingUp, Globe2, FileText, type LucideIcon } from "lucide-react";

const GRADIENTS = [
  "linear-gradient(140deg,#4f46e5,#6d5cf0)",
  "linear-gradient(140deg,#0891b2,#06b6d4)",
  "linear-gradient(140deg,#0d9c72,#10b981)",
  "linear-gradient(140deg,#d97706,#f59e0b)",
];

// Purely decorative background waves — not tied to any real trend value.
// We intentionally do NOT show a fabricated "+N" delta chip here since we
// don't have real historical per-KPI series wired up; showing invented
// deltas would be misleading.
const SPARK_PATHS = [
  "M0 26 40 22 80 24 120 14 160 16 200 6",
  "M0 24 40 26 80 18 120 20 160 12 200 10",
  "M0 28 40 24 80 20 120 18 160 12 200 8",
  "M0 22 40 20 80 22 120 14 160 16 200 9",
];

interface KpiItem {
  icon: LucideIcon;
  value: string;
  suffix?: string;
  label: string;
}

export function KpiTiles({
  locale,
  activeProjects,
  avgScore,
  countriesTested,
  monthlyReports,
}: {
  locale: string;
  activeProjects: number;
  avgScore: number | null;
  countriesTested: number;
  monthlyReports: number;
}) {
  const isKo = locale === "ko";
  const items: KpiItem[] = [
    {
      icon: Compass,
      value: String(activeProjects),
      label: isKo ? "진행 중 프로젝트" : "Active projects",
    },
    {
      icon: TrendingUp,
      value: avgScore != null ? String(avgScore) : "—",
      suffix: avgScore != null ? (isKo ? "점" : "pt") : undefined,
      label: isKo ? "평균 성공 점수" : "Avg. success score",
    },
    {
      icon: Globe2,
      value: String(countriesTested),
      suffix: isKo ? "개국" : undefined,
      label: isKo ? "검증한 시장" : "Markets tested",
    },
    {
      icon: FileText,
      value: String(monthlyReports),
      label: isKo ? "이번 달 리포트" : "Reports this month",
    },
  ];

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((it, i) => (
        <div
          key={it.label}
          className="relative overflow-hidden rounded-2xl p-[18px] text-white shadow-card"
          style={{ background: GRADIENTS[i] }}
        >
          <div
            className="w-[38px] h-[38px] rounded-xl flex items-center justify-center mb-3.5"
            style={{ background: "rgba(255,255,255,.2)" }}
          >
            <it.icon size={20} />
          </div>
          <div className="text-[29px] font-extrabold leading-none tabular-nums">
            {it.value}
            {it.suffix && (
              <small className="text-[15px] font-bold opacity-80 ml-0.5">{it.suffix}</small>
            )}
          </div>
          <div className="mt-[7px] text-[12.5px] font-semibold text-white/90">{it.label}</div>
          <svg
            className="absolute bottom-0 left-0 right-0 h-[34px] opacity-50 pointer-events-none"
            viewBox="0 0 200 34"
            preserveAspectRatio="none"
          >
            <path d={SPARK_PATHS[i]} fill="none" stroke="#fff" strokeWidth={2.5} />
          </svg>
        </div>
      ))}
    </section>
  );
}
