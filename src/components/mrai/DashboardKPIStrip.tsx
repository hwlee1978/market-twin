import Link from "next/link";
import { Eye, Radio, FileText, Brain, type LucideIcon } from "lucide-react";
import type { DashboardKPIs } from "@/lib/mrai/dashboard-kpis";

type Tone = "violet" | "emerald" | "amber" | "sky";

const TONE: Record<
  Tone,
  { ring: string; iconBg: string; iconText: string; valueText: string }
> = {
  violet: {
    ring: "hover:ring-violet-200",
    iconBg: "bg-violet-50",
    iconText: "text-violet-600",
    valueText: "text-violet-700",
  },
  emerald: {
    ring: "hover:ring-emerald-200",
    iconBg: "bg-emerald-50",
    iconText: "text-emerald-600",
    valueText: "text-emerald-700",
  },
  amber: {
    ring: "hover:ring-amber-200",
    iconBg: "bg-amber-50",
    iconText: "text-amber-600",
    valueText: "text-amber-700",
  },
  sky: {
    ring: "hover:ring-sky-200",
    iconBg: "bg-sky-50",
    iconText: "text-sky-600",
    valueText: "text-sky-700",
  },
};

function KPICard({
  href,
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string | null;
  tone: Tone;
}) {
  const t = TONE[tone];
  return (
    <Link
      href={href}
      className={`group relative bg-white border border-slate-200 rounded-xl p-4 transition ring-2 ring-transparent ${t.ring} hover:shadow-sm`}
    >
      <div className="flex items-start gap-3">
        <div className={`shrink-0 w-9 h-9 rounded-lg ${t.iconBg} flex items-center justify-center`}>
          <Icon className={`w-4.5 h-4.5 ${t.iconText}`} strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
            {label}
          </div>
          <div className={`mt-0.5 text-2xl font-bold ${t.valueText} leading-tight`}>
            {value}
          </div>
          {sub && (
            <div className="mt-0.5 text-[11px] text-slate-500 truncate">{sub}</div>
          )}
        </div>
      </div>
    </Link>
  );
}

function fmtAgo(iso: string | null, locale: "ko" | "en"): string | null {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / 1000 / 3600);
  if (hours < 1) return locale === "ko" ? "방금" : "just now";
  if (hours < 24) return locale === "ko" ? `${hours}시간 전` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return locale === "ko" ? `${days}일 전` : `${days}d ago`;
}

export function DashboardKPIStrip({
  kpis,
  locale,
}: {
  kpis: DashboardKPIs;
  locale: "ko" | "en";
}) {
  const base = `/${locale}/mr-ai`;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KPICard
        href={`${base}/analytics`}
        icon={Eye}
        label={locale === "ko" ? "LLM 가시성" : "LLM visibility"}
        value={kpis.visibilityScore !== null ? `${kpis.visibilityScore}` : "—"}
        sub={
          kpis.visibilityScore !== null
            ? fmtAgo(kpis.visibilityRunAt, locale)
            : locale === "ko"
            ? "측정 전"
            : "not measured"
        }
        tone="violet"
      />
      <KPICard
        href={`${base}/channels`}
        icon={Radio}
        label={locale === "ko" ? "마케팅 채널" : "Marketing channels"}
        value={`${kpis.marketingChannels}`}
        sub={
          kpis.marketingChannels === 0
            ? locale === "ko"
              ? "추가 필요"
              : "add one"
            : null
        }
        tone="emerald"
      />
      <KPICard
        href={`${base}/content`}
        icon={FileText}
        label={locale === "ko" ? "콘텐츠 브리프" : "Content briefs"}
        value={`${kpis.recentBriefs}`}
        sub={
          kpis.recentBriefs === 0
            ? locale === "ko"
              ? "최근 7일 · 작성하기"
              : "last 7d · create one"
            : locale === "ko"
            ? "최근 7일"
            : "last 7 days"
        }
        tone="amber"
      />
      <KPICard
        href={`${base}/settings`}
        icon={Brain}
        label={locale === "ko" ? "기억 항목" : "Memories"}
        value={`${kpis.memoryCount}`}
        sub={locale === "ko" ? "장기 컨텍스트" : "long-term context"}
        tone="sky"
      />
    </div>
  );
}
