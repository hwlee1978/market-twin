import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { CountryMark } from "./CountryMark";

export interface MarketRankingRow {
  code: string;
  label: string;
  score: number; // 0-100
}

export function MarketRanking({
  locale,
  rows,
  detailHref,
}: {
  locale: string;
  rows: MarketRankingRow[];
  detailHref?: string;
}) {
  const isKo = locale === "ko";
  const S = isKo
    ? { eyebrow: "시장 랭킹", title: (n: number) => `${n}개 후보 시장 점수`, detail: "상세" }
    : { eyebrow: "Market ranking", title: (n: number) => `${n} candidate markets`, detail: "Details" };

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-[11px] font-extrabold tracking-[.1em] uppercase text-slate-400">
            {S.eyebrow}
          </div>
          <h2 className="text-[15.5px] font-extrabold text-slate-900 mt-0.5">
            {S.title(rows.length)}
          </h2>
        </div>
        {detailHref && (
          <Link
            href={detailHref}
            className="text-[12.5px] font-extrabold text-accent-600 inline-flex items-center gap-1 shrink-0"
          >
            {S.detail}
            <ChevronRight size={13} />
          </Link>
        )}
      </div>
      {rows.map((row, i) => {
        const isWinner = i === 0;
        return (
          <div
            key={row.code}
            className="flex items-center gap-3.5 py-2.5 border-b border-slate-100 last:border-b-0 last:pb-0 first:pt-0"
          >
            <div
              className="w-[22px] h-[22px] rounded-[7px] grid place-items-center text-[11.5px] font-extrabold shrink-0"
              style={
                isWinner
                  ? { background: "linear-gradient(135deg,#10b981,#34d399)", color: "#fff" }
                  : { background: "#f2f6fc", color: "#8194ad" }
              }
            >
              {i + 1}
            </div>
            <CountryMark code={row.code} size="sm" />
            <div className="text-[13px] font-bold text-slate-900 w-[74px] shrink-0 truncate">
              {row.label}
            </div>
            <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(0, Math.min(100, row.score))}%`,
                  background: isWinner
                    ? "linear-gradient(90deg,#0d9c72,#34d399)"
                    : "linear-gradient(90deg,#2563eb,#06b6d4)",
                }}
              />
            </div>
            <div className="text-sm font-extrabold text-slate-900 w-[34px] text-right tabular-nums shrink-0">
              {Math.round(row.score)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
