import { Slide } from "../components/Slide";

/**
 * Slide 04 — WHAT IS Mr. AI · One-line definition.
 * Frame the category jump: existing marketing OS players (DOJO AI,
 * Daydream, HubSpot Breeze, Klaviyo Marketing Agent) = "marketing OS",
 * Mr. AI = "CEO OS". 1 founder running like 5-person C-suite, with a
 * strategic-decision layer that no marketing OS has.
 */
export function OneLineDef({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  return (
    <Slide variant="dark" sectionLabel="B · WHAT IS Mr. AI" pageNumber={pageNumber} totalPages={totalPages}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", paddingTop: 24 }}>
        <span className="mrai-cover__tagline" style={{ marginTop: 0 }}>CATEGORY 격상</span>
        <h2 style={{ fontSize: 84, lineHeight: 1.0, letterSpacing: "-0.035em", fontWeight: 800, marginTop: 24, maxWidth: "95%" }}>
          <span style={{ color: "var(--mrai-ink-muted-dark)", fontWeight: 600, fontSize: 38, display: "block", marginBottom: 8 }}>
            DOJO · Daydream · HubSpot · Klaviyo 는 "마케팅 OS".
          </span>
          Mr. AI 는<br />
          <span className="mrai-emph">AI Marketer + AI Strategist</span>.
        </h2>

        <p style={{ fontSize: 22, lineHeight: 1.55, fontWeight: 400, color: "var(--mrai-ink-muted-dark)", marginTop: 36, maxWidth: "85%" }}>
          마케터 1명을 자동화하는 게 아니라, <span style={{ color: "var(--mrai-ink-on-dark)", fontWeight: 600 }}>1인 CEO가 product에만 집중할 수 있도록</span>{" "}
          마케팅 · 영업 · IR · 전략 의사결정 · 운영을 통째로 위임받는 AI 임원.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, marginTop: 48, width: "100%", maxWidth: 1100 }}>
          <div className="mrai-card" style={{ borderColor: "var(--mrai-rule-dark)" }}>
            <div className="mrai-card__label" style={{ color: "var(--mrai-ink-muted-dark)" }}>경쟁 product의 약속</div>
            <p style={{ fontSize: 18, lineHeight: 1.5, color: "var(--mrai-ink-on-dark)", margin: "8px 0 0" }}>
              "마케터 1명을<br /><span style={{ color: "var(--mrai-ink-muted-dark)" }}>콘텐츠 운영 자동화로 대체"</span>
            </p>
            <p style={{ fontSize: 12, color: "var(--mrai-ink-muted-dark)", marginTop: 14, fontStyle: "italic" }}>— DOJO · Daydream · HubSpot Breeze 카테고리</p>
          </div>
          <div className="mrai-card" style={{ background: "rgba(245,158,11,0.10)", borderColor: "var(--mrai-accent)" }}>
            <div className="mrai-card__label" style={{ color: "var(--mrai-accent)" }}>Mr. AI 의 약속</div>
            <p style={{ fontSize: 18, lineHeight: 1.5, color: "var(--mrai-ink-on-dark)", margin: "8px 0 0", fontWeight: 600 }}>
              "Founder 1명이<br />
              <span className="mrai-emph">임원 5명으로 운영</span>"
            </p>
            <p style={{ fontSize: 12, color: "var(--mrai-ink-muted-dark)", marginTop: 14 }}>
              마케팅 · 영업 · IR · <span className="mrai-cool">전략</span> · 운영
            </p>
          </div>
        </div>

        <div style={{ marginTop: 36, padding: "16px 24px", border: "1px solid var(--mrai-rule-dark)", borderRadius: 12, fontSize: 14, lineHeight: 1.6, maxWidth: 1100 }}>
          <span style={{ color: "var(--mrai-accent)", fontWeight: 700 }}>3배 큰 카테고리</span>{" · "}
          마케팅 SaaS $47B 의 시장 정의 안 들어옴 — "Founder Productivity / CEO OS"는 아직{" "}
          <span className="mrai-emph">정의되지 않은 시장</span>이지만 잠재 사이즈는 훨씬 큼. 이 카테고리를 한국에서 먼저 정의하는 자가 winner.
        </div>
      </div>
    </Slide>
  );
}
