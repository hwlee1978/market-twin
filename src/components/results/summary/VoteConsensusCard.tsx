import { CountryMark } from "@/components/dashboard/CountryMark";
import { getCountryLabel } from "@/lib/countries";

interface VoteRow {
  country: string;
  count: number;
  percent: number;
}

/**
 * 1st-place vote split across the ensemble's independent simulations.
 *
 * Rendered as a stacked bar plus one row per market rather than the old
 * pie + bar pair: with 3-6 sims the distribution is usually a flat 33/33/33
 * or 50/50, and a donut of equal slices communicates nothing while taking
 * half the card. The bar makes "no one won" visually obvious.
 *
 * Markets that scored well on mean but never won a sim don't appear here at
 * all — that is exactly why the hero shows their 0% explicitly.
 */
export function VoteConsensusCard({
  rows,
  winner,
  secondary,
  simCount,
  isKo,
  locale,
}: {
  rows: VoteRow[];
  winner: string;
  secondary?: string | null;
  simCount: number;
  isKo: boolean;
  locale: string;
}) {
  const sorted = [...rows].sort((a, b) => b.percent - a.percent);
  const top = sorted[0]?.percent ?? 0;
  const isSplit = sorted.length > 1 && sorted.filter((r) => r.percent === top).length > 1;

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h3 className="text-[15px] font-extrabold text-slate-900 tracking-tight">
          {isKo ? "1순위 투표 분포" : "1st-place vote split"}
        </h3>
        <span className="text-[11.5px] font-semibold text-slate-400">
          {isKo ? `독립 시뮬 ${simCount}개` : `${simCount} independent sims`}
        </span>
      </div>

      <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">
        {isSplit
          ? isKo
            ? "표가 완전히 갈렸습니다 — 이 시뮬 수로는 우승국을 가릴 수 없다는 뜻입니다."
            : "The vote is evenly split — this many sims cannot separate a winner."
          : isKo
            ? "각 시뮬이 독립적으로 1순위로 지목한 시장입니다."
            : "The market each independent simulation put first."}
      </p>

      {/* stacked share bar */}
      <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
        {sorted.map((r) => (
          <div
            key={r.country}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${r.percent}%`,
              background:
                r.country === winner
                  ? "linear-gradient(90deg,#0d9c72,#10b981)"
                  : r.country === secondary
                    ? "linear-gradient(90deg,#d97706,#f59e0b)"
                    : "#cbd5e1",
            }}
            title={`${r.country} ${r.percent}%`}
          />
        ))}
      </div>

      <ul className="mt-4 space-y-2.5">
        {sorted.map((r) => {
          const isWinner = r.country === winner;
          const isSecondary = r.country === secondary;
          return (
            <li key={r.country} className="flex items-center gap-3">
              <CountryMark code={r.country} size="sm" />
              <span
                className={
                  "text-[13px] truncate " +
                  (isWinner ? "font-extrabold text-slate-900" : "font-semibold text-slate-600")
                }
              >
                {getCountryLabel(r.country, locale)}
              </span>
              {isWinner && (
                <span className="shrink-0 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-extrabold text-success">
                  {isKo ? "추천" : "PICK"}
                </span>
              )}
              {isSecondary && !isWinner && (
                <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-[10px] font-extrabold text-warn">
                  {isKo ? "동등 후보" : "CO-LEAD"}
                </span>
              )}
              <span className="ml-auto shrink-0 text-[12px] font-semibold tabular-nums text-slate-500">
                {r.count}/{simCount}
              </span>
              <span
                className={
                  "w-12 shrink-0 text-right text-[13px] font-extrabold tabular-nums " +
                  (isWinner ? "text-success" : "text-slate-500")
                }
              >
                {r.percent}%
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
