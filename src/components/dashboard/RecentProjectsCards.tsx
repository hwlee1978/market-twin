import {
  Sparkles,
  ShoppingBag,
  Coffee,
  HeartPulse,
  Smartphone,
  Home,
  Layers,
  Package,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CountryMark } from "./CountryMark";
import { formatRelativeTime } from "./relativeTime";

// Exported so other project-listing surfaces (e.g. the /projects card list)
// can reuse the exact same category → icon/color mapping instead of
// re-deriving a second palette that could drift out of sync.
export const CATEGORY_META: Record<string, { icon: LucideIcon; bg: string; fg: string }> = {
  beauty: { icon: Sparkles, bg: "bg-violet-50", fg: "text-violet-600" },
  fashion: { icon: ShoppingBag, bg: "bg-amber-50", fg: "text-amber-600" },
  food: { icon: Coffee, bg: "bg-teal-50", fg: "text-teal-600" },
  health: { icon: HeartPulse, bg: "bg-rose-50", fg: "text-rose-600" },
  electronics: { icon: Smartphone, bg: "bg-blue-50", fg: "text-blue-600" },
  home: { icon: Home, bg: "bg-emerald-50", fg: "text-emerald-600" },
  saas: { icon: Layers, bg: "bg-indigo-50", fg: "text-indigo-600" },
};
export const DEFAULT_CATEGORY_META = { icon: Package, bg: "bg-slate-100", fg: "text-slate-500" };

export interface RecentProjectRow {
  id: string;
  name: string;
  productName: string;
  status: string;
  statusLabel: string;
  category: string | null;
  countryCodes: string[];
  updatedAt: string | null;
  /** Present only for the one project matching the latest completed ensemble. */
  ensembleInfo: {
    countryLabel: string;
    score: number | null;
    confidence: string | null;
  } | null;
}

export function RecentProjectsCards({
  locale,
  projects,
  totalCount,
}: {
  locale: string;
  projects: RecentProjectRow[];
  totalCount: number;
}) {
  const isKo = locale === "ko";
  const S = isKo
    ? { eyebrow: "최근 프로젝트", title: "최근 프로젝트", total: (n: number) => `전체 ${n}개`, recommended: (c: string) => `${c} 추천` }
    : { eyebrow: "Recent projects", title: "Recent projects", total: (n: number) => `${n} total`, recommended: (c: string) => `${c} recommended` };

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-3">
        <h2 className="text-[15px] font-extrabold text-slate-900 tracking-tight">{S.title}</h2>
        <span className="ml-auto text-[11.5px] font-semibold text-slate-400">{S.total(totalCount)}</span>
      </div>
      <div className="card p-2.5">
        {projects.map((p) => {
          const meta = (p.category && CATEGORY_META[p.category]) || DEFAULT_CATEGORY_META;
          const ago = formatRelativeTime(p.updatedAt, locale);
          return (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="flex items-center gap-3.5 p-3.5 rounded-[13px] border border-transparent hover:bg-slate-50 hover:border-slate-200 transition-colors"
            >
              <span
                className={`w-11 h-11 rounded-xl grid place-items-center shrink-0 ${meta.bg} ${meta.fg}`}
              >
                <meta.icon size={20} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-bold text-slate-900 truncate">{p.name}</div>
                <div className="text-[11.5px] text-slate-400 font-medium mt-[3px] flex items-center gap-2 flex-wrap">
                  {p.ensembleInfo ? (
                    <>
                      <span className="inline-flex items-center gap-1">
                        {S.recommended(p.ensembleInfo.countryLabel)}
                      </span>
                      {p.ensembleInfo.confidence && (
                        <>
                          <span className="w-[3px] h-[3px] rounded-full bg-slate-300" />
                          <span className="text-[10.5px] font-extrabold text-slate-400">
                            {p.ensembleInfo.confidence}
                          </span>
                        </>
                      )}
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      {p.countryCodes.map((c) => (
                        <CountryMark key={c} code={c} size="sm" />
                      ))}
                    </span>
                  )}
                  {ago && (
                    <>
                      <span className="w-[3px] h-[3px] rounded-full bg-slate-300" />
                      {ago}
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {p.ensembleInfo?.score != null && (
                  <b className="text-[17px] font-extrabold text-slate-900 tabular-nums">
                    {p.ensembleInfo.score}
                  </b>
                )}
                <StatusBadge status={p.status} label={p.statusLabel} />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
