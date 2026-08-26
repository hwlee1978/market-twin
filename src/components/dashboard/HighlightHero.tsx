import { TrendingUp, Shield, Clock3, Check } from "lucide-react";
import { CountryMark } from "./CountryMark";

type RiskLevel = "low" | "medium" | "high";
type Confidence = "STRONG" | "MODERATE" | "WEAK";

const RISK_STYLE: Record<RiskLevel, { bg: string; fg: string; labelKo: string; labelEn: string }> = {
  low: { bg: "rgba(16,185,129,.22)", fg: "#6ef0c1", labelKo: "낮음 · 안정적", labelEn: "LOW · Stable" },
  medium: { bg: "rgba(245,158,11,.22)", fg: "#fbd07f", labelKo: "보통 · 관리가능", labelEn: "MEDIUM · Manageable" },
  high: { bg: "rgba(244,63,94,.24)", fg: "#ffb0bd", labelKo: "높음 · 주의 필요", labelEn: "HIGH · Caution" },
};

const CONFIDENCE_STYLE: Record<Confidence, { bg: string; fg: string }> = {
  STRONG: { bg: "rgba(16,185,129,.24)", fg: "#6ef0c1" },
  MODERATE: { bg: "rgba(245,158,11,.22)", fg: "#fbd07f" },
  WEAK: { bg: "rgba(244,63,94,.24)", fg: "#ffb0bd" },
};

/**
 * Deep-navy hero card — recommended market, 3 metric chips, and a 4-step
 * entry roadmap. The roadmap's first two steps are marked "done" because
 * they're only ever rendered once a completed ensemble exists (market
 * research + validation sims are, by definition, finished); steps 3/4
 * ("entry strategy" / "expansion") are the generic next phases of the
 * product's own funnel, not simulation output — there's no per-project
 * field yet tracking which of those a user has started.
 */
export function HighlightHero({
  locale,
  productName,
  countryCode,
  countryLabel,
  simCount,
  countryCount,
  providerNames,
  successProbability,
  riskLevel,
  consensusPercent,
  confidence,
  updatedAgoLabel,
}: {
  locale: string;
  productName: string;
  countryCode: string;
  countryLabel: string;
  simCount: number;
  countryCount: number;
  providerNames: string[];
  successProbability: number | null;
  riskLevel: RiskLevel | null;
  consensusPercent: number | null;
  confidence: Confidence | null;
  updatedAgoLabel: string;
}) {
  const isKo = locale === "ko";
  const S = isKo
    ? {
        eyebrow: "추천 시장 · 앙상블 합의",
        title: (c: string) => `${c} 진출을 추천합니다.`,
        sub: (n: number, m: number, provs: string) =>
          `${n}개 시뮬레이션 · ${m}개 시장${provs ? ` · ${provs}` : ""}`,
        recBadgeLabel: "추천 시장",
        successLabel: "성공 확률",
        riskLabel: "리스크",
        consensusLabel: "합의 수준",
        roadmapTitle: "시장 진출 로드맵",
        steps: ["시장 조사", "검증 시뮬레이션", "진입 전략", "확장"],
        stateDone: "완료",
        stateNow: "진행 중",
        stateTodo: "예정",
      }
    : {
        eyebrow: "Recommended market · ensemble consensus",
        title: (c: string) => `Start your expansion in ${c}.`,
        sub: (n: number, m: number, provs: string) =>
          `${n} simulations · ${m} markets${provs ? ` · ${provs}` : ""}`,
        recBadgeLabel: "Recommended",
        successLabel: "Success probability",
        riskLabel: "Risk",
        consensusLabel: "Consensus",
        roadmapTitle: "Market entry roadmap",
        steps: ["Market research", "Validation sims", "Entry strategy", "Expansion"],
        stateDone: "Done",
        stateNow: "In progress",
        stateTodo: "Upcoming",
      };

  const risk = riskLevel ? RISK_STYLE[riskLevel] : null;
  const conf = confidence ? CONFIDENCE_STYLE[confidence] : null;
  const providersLabel = providerNames.join(" · ");

  return (
    <div
      className="rounded-[18px] shadow-card relative overflow-hidden text-[#eaf1fb]"
      style={{ background: "linear-gradient(155deg,#0b2a5b 0%,#123c78 55%,#1a4fa0 100%)" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(80% 120% at 106% -8%, rgba(6,182,212,.4), transparent 46%), radial-gradient(70% 90% at -6% 108%, rgba(124,58,237,.34), transparent 50%)",
        }}
      />
      <div className="relative z-10 p-5">
        <div className="flex items-start justify-between gap-4 mb-[18px] flex-wrap">
          <div>
            <div className="text-[11px] font-extrabold tracking-[.12em] uppercase text-[#8fb7e6]">
              {S.eyebrow}
            </div>
            <div className="text-xl font-extrabold text-white mt-1.5">{S.title(countryLabel)}</div>
            <div className="text-[12.5px] text-[#a9c4e6] mt-1 font-medium">
              {S.sub(simCount, countryCount, providersLabel)}
            </div>
          </div>
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-xl px-3.5 py-2 shrink-0">
            <CountryMark code={countryCode} size="lg" />
            <div>
              <span className="block text-[10px] text-[#9fc0e8] font-extrabold tracking-[.08em] uppercase">
                {S.recBadgeLabel}
              </span>
              <b className="text-white text-[15px] font-extrabold">{countryLabel}</b>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <div
            className="rounded-[13px] p-3.5 border border-white/10"
            style={{ background: "linear-gradient(135deg,rgba(16,185,129,.24),rgba(16,185,129,.08))" }}
          >
            <div className="text-[11px] text-[#cfe0f4] font-extrabold flex items-center gap-1.5">
              <TrendingUp size={13} />
              {S.successLabel}
            </div>
            <div className="text-[23px] font-extrabold text-white mt-2 leading-none tabular-nums">
              {successProbability != null ? successProbability : "—"}
              {successProbability != null && (
                <small className="text-[12px] font-bold text-[#bcd2ec]">/100</small>
              )}
            </div>
          </div>
          <div
            className="rounded-[13px] p-3.5 border border-white/10"
            style={{ background: "linear-gradient(135deg,rgba(245,158,11,.24),rgba(245,158,11,.08))" }}
          >
            <div className="text-[11px] text-[#cfe0f4] font-extrabold flex items-center gap-1.5">
              <Shield size={13} />
              {S.riskLabel}
            </div>
            <div className="mt-[11px]">
              {risk ? (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-1 rounded-full"
                  style={{ background: risk.bg, color: risk.fg }}
                >
                  {isKo ? risk.labelKo : risk.labelEn}
                </span>
              ) : (
                <span className="text-white/60 text-sm">—</span>
              )}
            </div>
          </div>
          <div
            className="rounded-[13px] p-3.5 border border-white/10"
            style={{ background: "linear-gradient(135deg,rgba(6,182,212,.24),rgba(6,182,212,.08))" }}
          >
            <div className="text-[11px] text-[#cfe0f4] font-extrabold flex items-center gap-1.5">
              <Clock3 size={13} />
              {S.consensusLabel}
            </div>
            <div className="text-[23px] font-extrabold text-white mt-2 leading-none tabular-nums flex items-baseline gap-1.5">
              {consensusPercent != null ? (
                <>
                  {consensusPercent}
                  <small className="text-[12px] font-bold text-[#bcd2ec]">%</small>
                </>
              ) : (
                "—"
              )}
              {conf && confidence && (
                <span
                  className="text-[11px] font-extrabold px-2.5 py-1 rounded-full"
                  style={{ background: conf.bg, color: conf.fg }}
                >
                  {confidence}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-white/[.14] pt-4">
          <div className="text-[11px] font-extrabold tracking-[.12em] uppercase text-[#8fb7e6] mb-4">
            {S.roadmapTitle}
          </div>
          <div className="flex items-start">
            {S.steps.map((name, i) => {
              const state = i < 2 ? "done" : i === 2 ? "now" : "todo";
              return (
                <div key={name} className="flex-1 flex flex-col items-center text-center relative gap-2">
                  {i < S.steps.length - 1 && (
                    <div
                      className="absolute top-[14px] left-1/2 w-full h-[3px] rounded-full z-0"
                      style={{
                        background:
                          state === "done"
                            ? "linear-gradient(90deg,#06b6d4,rgba(6,182,212,.35))"
                            : "rgba(255,255,255,.14)",
                      }}
                    />
                  )}
                  <div
                    className="w-[30px] h-[30px] rounded-full grid place-items-center z-10 text-xs font-extrabold shrink-0"
                    style={
                      state === "done"
                        ? {
                            background: "linear-gradient(135deg,#06b6d4,#22d3ee)",
                            color: "#04222a",
                            boxShadow: "0 0 0 5px rgba(6,182,212,.2)",
                          }
                        : state === "now"
                          ? {
                              background: "#fff",
                              color: "#0b2a5b",
                              boxShadow: "0 0 0 5px rgba(255,255,255,.24)",
                              animation: "mtRoadmapPulse 2s infinite",
                            }
                          : {
                              background: "rgba(255,255,255,.14)",
                              color: "#a9c4e6",
                              border: "1px solid rgba(255,255,255,.22)",
                            }
                    }
                  >
                    {state === "done" ? <Check size={15} strokeWidth={3} /> : i + 1}
                  </div>
                  <div className="text-xs font-bold text-[#dbe7f6]">{name}</div>
                  <div
                    className="text-[10.5px] font-extrabold tracking-[.04em]"
                    style={{ color: state === "done" ? "#22d3ee" : state === "now" ? "#fff" : "#7f9bc4" }}
                  >
                    {state === "done" ? S.stateDone : state === "now" ? S.stateNow : S.stateTodo}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {updatedAgoLabel && (
          <div className="mt-3 text-[11px] text-[#7f9bc4] font-semibold">
            {productName} · {updatedAgoLabel}
          </div>
        )}
      </div>
      <style>{`@keyframes mtRoadmapPulse{0%,100%{box-shadow:0 0 0 5px rgba(255,255,255,.24)}50%{box-shadow:0 0 0 8px rgba(255,255,255,.12)}}`}</style>
    </div>
  );
}
