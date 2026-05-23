import { Slide } from "../components/Slide";

/**
 * Slide 05 — 4 Unfair Differentiators.
 * Each row: name + what it does + why competitors cannot copy.
 * Market Validation row is the showstopper — 6 months of Market Twin
 * R&D = no competitor can replicate in <12 months.
 */
export function FourDifferentiators({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  return (
    <Slide variant="light" sectionLabel="B · WHAT IS Mr. AI" pageNumber={pageNumber} totalPages={totalPages}>
      <h2 className="mrai-slide__title">
        4개의 <span className="mrai-emph">Unfair Differentiator</span>
      </h2>
      <div className="mrai-slide__rule" />
      <p className="mrai-slide__subtitle" style={{ marginBottom: 28 }}>
        DOJO · Daydream · HubSpot · Klaviyo 중 누구도 동시에 못 갖는 4가지. 각각 6개월~2년 R&D 격차.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <DiffCard
          num="01"
          name="Voice DNA"
          desc="Founder · 브랜드 글 1시간 학습 → 모든 출력이 founder 톤. AI 티 안 남."
          moat="FSN 부스터즈 K-브랜드 voice guide 풀 — 즉시 학습 데이터로 활용. AI 회사는 못 가짐."
        />
        <DiffCard
          num="02"
          name="Outcome Attribution"
          desc="HubSpot (CRM) · LinkedIn · X · GA4 (웹 분석) 통합 → '이 콘텐츠 → ₩X 매출' 실측. 기존 마케팅 OS의 traffic proxy를 매출 closed-loop으로 격상."
          moat="카울리 광고 데이터 + 부스터즈 매출 데이터 = closed-loop 즉시 구축. 외부 SaaS는 통합 1년+ 걸림."
        />
        <DiffCard
          num="03"
          name="Persistent Memory"
          desc="회사 바뀌어도 같은 Mr. AI가 따라옴. Founder의 평생 학습. 한 번 학습된 voice·선호·패턴 영구 보존."
          moat="고객이 떠날 수 없는 설계 — 한 번 학습된 voice·이력이 평생 자산. (Churn = 월간 이탈률, 업계 평균 5%/월. Mr. AI 목표 1-2%.)"
          accent
        />
        <DiffCard
          num="04"
          name="Market Validation (🆕)"
          desc="5,000 페르소나 × 24 시장 = 120,000 시장 평가 데이터로 시장·가격·채널 전략 답 (5 LLM ensemble cross-validation). McKinsey 1주 컨설팅 ₩수억 → Mr. AI cost 수십만원."
          moat="Mr. AI에만 있는 layer. 6개월 R&D + 27 정부 데이터 seed + 33 fixture benchmark 검증 완료. 경쟁사 따라잡으려면 1-2년."
          accent
        />
      </div>

      <div style={{ marginTop: 24, padding: "14px 24px", background: "var(--mrai-bg-dark)", color: "var(--mrai-ink-on-dark)", borderRadius: 12, fontSize: 14, lineHeight: 1.55 }}>
        <span style={{ color: "var(--mrai-accent)", fontWeight: 700, marginRight: 12 }}>핵심</span>
        4개 중 2개 (Voice DNA + Outcome Attribution)는 <span className="mrai-emph">FSN 자산이 있어서 가능</span>. 다른 2개 (Persistent + Market
        Validation)는 <span className="mrai-emph">Market Twin의 6개월 R&D</span>로 이미 보유. 합쳐지면 시장 진입 즉시 4개 동시 가동.
      </div>
    </Slide>
  );
}

function DiffCard({
  num, name, desc, moat, accent,
}: {
  num: string;
  name: string;
  desc: string;
  moat: string;
  accent?: boolean;
}) {
  const style = accent
    ? { background: "rgba(245,158,11,0.06)", borderColor: "var(--mrai-accent)" }
    : {};
  return (
    <div className="mrai-card" style={style}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 8 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: "var(--mrai-accent)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{num}</span>
        <span style={{ fontSize: 22, fontWeight: 700, color: "var(--mrai-ink-on-light)" }}>{name}</span>
      </div>
      <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--mrai-ink-on-light)", margin: "4px 0 10px" }}>{desc}</p>
      <div style={{ paddingTop: 10, borderTop: "1px solid var(--mrai-rule-light)" }}>
        <div className="mrai-card__label" style={{ marginBottom: 4 }}>왜 경쟁사 못 copy</div>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--mrai-ink-muted-light)", margin: 0 }}>{moat}</p>
      </div>
    </div>
  );
}
