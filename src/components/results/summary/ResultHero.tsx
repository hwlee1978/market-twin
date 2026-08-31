import type { ReactNode } from "react";
import { CheckCircle2, Scale, Sparkles } from "lucide-react";
import { CountryMark } from "@/components/dashboard/CountryMark";
import { getCountryLabel } from "@/lib/countries";

type Confidence = "STRONG" | "MODERATE" | "WEAK";

const CONFIDENCE_STYLE: Record<Confidence, { bg: string; fg: string }> = {
  STRONG: { bg: "rgba(16,185,129,.24)", fg: "#6ef0c1" },
  MODERATE: { bg: "rgba(245,158,11,.22)", fg: "#fbd07f" },
  WEAK: { bg: "rgba(244,63,94,.24)", fg: "#ffb0bd" },
};

/**
 * Deep-navy verdict hero for the results Summary tab — the same visual
 * language as the dashboard's HighlightHero, so moving from the dashboard
 * into a report doesn't cross a design seam.
 *
 * Two modes, and the distinction is the whole point of the card:
 *   single — one market won the vote; shown with its agreement level
 *   top2   — the engine could not separate the top two, so BOTH are named
 *            and the 1st-place vote split is shown as-is. A co-leader that
 *            won zero sims legitimately reads 0% (it ranks on mean score,
 *            not on votes) — that contrast is the reader's main cue.
 */
export function ResultHero({
  isKo,
  locale,
  productName,
  countryCode,
  secondaryCountryCode,
  confidence,
  consensusPercent,
  primaryVotePercent,
  secondaryVotePercent,
  gapToPrimary,
  simCount,
  marketCount,
  providerNames,
  consensusBadge,
}: {
  isKo: boolean;
  locale: string;
  productName?: string | null;
  countryCode: string;
  /** Set only in top-2 (tie) mode. */
  secondaryCountryCode?: string | null;
  confidence: Confidence;
  consensusPercent: number;
  primaryVotePercent: number;
  secondaryVotePercent: number;
  gapToPrimary?: number;
  simCount: number;
  marketCount: number;
  providerNames: string[];
  /** Slot for the existing ConsensusTypeBadge element. */
  consensusBadge?: ReactNode;
}) {
  const isTie = !!secondaryCountryCode;
  const conf = CONFIDENCE_STYLE[confidence];
  const primaryLabel = getCountryLabel(countryCode, locale);
  const secondaryLabel = secondaryCountryCode
    ? getCountryLabel(secondaryCountryCode, locale)
    : null;
  const providers = providerNames.filter(Boolean).join(" · ");

  return (
    <section
      className="relative overflow-hidden rounded-2xl p-6 sm:p-7 text-white shadow-card"
      style={{ background: "linear-gradient(140deg,#111c3a,#1e2f5e 55%,#26407a)" }}
    >
      <div
        aria-hidden
        className="absolute -top-24 -right-16 w-64 h-64 rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(99,102,241,.35), transparent 65%)",
        }}
      />

      <div className="relative">
        <div className="flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-[0.14em] text-white/60">
          {isTie ? <Scale size={13} /> : <Sparkles size={13} />}
          {isTie
            ? isKo
              ? "Top 2 동등 후보 · 단일 우승국 없음"
              : "Top 2 co-leaders · no single winner"
            : isKo
              ? "추천 진출국 · 앙상블 합의"
              : "Recommended market · ensemble consensus"}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <CountryMark code={countryCode} size="lg" />
          {isTie && secondaryCountryCode && (
            <>
              <span className="text-2xl font-light text-white/40">·</span>
              <CountryMark code={secondaryCountryCode} size="lg" />
            </>
          )}
          <h2 className="text-[30px] sm:text-[34px] font-extrabold leading-none tracking-tight">
            {isTie && secondaryLabel
              ? primaryLabel + " · " + secondaryLabel
              : primaryLabel}
          </h2>
          <span
            className="px-2.5 py-1 rounded-full text-[11.5px] font-extrabold"
            style={{ background: conf.bg, color: conf.fg }}
          >
            {confidence}
          </span>
          {consensusBadge}
        </div>

        {productName && (
          <div className="mt-2 text-[13px] font-semibold text-white/70">{productName}</div>
        )}

        {/* The three numbers the verdict actually rests on. */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {isTie ? (
            <>
              <HeroChip
                label={(isKo ? "1위표 · " : "1st-place · ") + primaryLabel}
                value={primaryVotePercent + "%"}
              />
              <HeroChip
                label={(isKo ? "1위표 · " : "1st-place · ") + (secondaryLabel ?? "")}
                value={secondaryVotePercent + "%"}
                muted={secondaryVotePercent === 0}
              />
              <HeroChip
                label={isKo ? "점수 격차" : "Score gap"}
                value={gapToPrimary != null ? gapToPrimary + "pt" : "—"}
              />
            </>
          ) : (
            <>
              <HeroChip
                label={isKo ? "1위표 합의도" : "1st-place agreement"}
                value={consensusPercent + "%"}
              />
              <HeroChip label={isKo ? "시뮬레이션" : "Simulations"} value={String(simCount)} />
              <HeroChip label={isKo ? "검증 시장" : "Markets tested"} value={String(marketCount)} />
            </>
          )}
        </div>

        <p className="mt-4 text-[12.5px] leading-relaxed text-white/70 max-w-3xl">
          {isTie
            ? isKo
              ? `두 시장의 점수 차이가 ${gapToPrimary ?? "—"}pt로 노이즈 범위 안입니다. 순서를 우열로 읽지 말고, 내부 역량과 리스크 감내 수준으로 고르세요. 이 두 시장은 시뮬 간 평균 순위로 뽑았습니다 — 매 시뮬 꾸준히 상위였다는 뜻이며, 평균 점수 순위와는 다를 수 있습니다.`
              : `The two markets sit ${gapToPrimary ?? "—"}pt apart — inside the noise margin. Don't read the order as a ranking; choose on internal capability and risk appetite. These two were picked on mean rank across sims — consistently high placement — which can differ from the mean-score order.`
            : isKo
              ? `${simCount}개 독립 시뮬 중 ${consensusPercent}%가 ${primaryLabel}을(를) 1순위로 지목했습니다.`
              : `${consensusPercent}% of ${simCount} independent simulations put ${primaryLabel} first.`}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] font-semibold text-white/45">
          <span>{isKo ? `시뮬 ${simCount}개` : `${simCount} sims`}</span>
          <span>·</span>
          <span>{isKo ? `시장 ${marketCount}개` : `${marketCount} markets`}</span>
          {providers && (
            <>
              <span>·</span>
              <span>{providers}</span>
            </>
          )}
        </div>
      </div>

      {!isTie && (
        <CheckCircle2 size={30} className="absolute top-6 right-6 text-white/25" aria-hidden />
      )}
    </section>
  );
}

function HeroChip({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-xl px-3.5 py-2.5" style={{ background: "rgba(255,255,255,.08)" }}>
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-white/50 truncate">
        {label}
      </div>
      <div
        className={
          "mt-1 text-[19px] font-extrabold tabular-nums leading-none " +
          (muted ? "text-white/45" : "text-white")
        }
      >
        {value}
      </div>
    </div>
  );
}
