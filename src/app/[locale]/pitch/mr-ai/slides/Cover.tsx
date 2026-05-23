/**
 * Slide 01 — Cover.
 * Dark variant for dramatic opening. Hero typography "Mr. AI",
 * tagline pill, subtitle one-liner positioning, meta grid with
 * proposer + date + audience.
 */
export function Cover({ totalPages }: { totalPages: number }) {
  return (
    <section className="mrai-slide mrai-slide--dark mrai-cover">
      <div>
        <div className="mrai-cover__brandblock">
          <span className="mrai-cover__bigmark" aria-hidden />
          <span className="mrai-cover__wordmark">Market Twin · markettwin.ai</span>
        </div>
        <h1 className="mrai-cover__hero">Mr. AI</h1>
        <span className="mrai-cover__tagline">EXECUTIVE-GRADE AI · CEO OS</span>
        <p className="mrai-cover__subtitle">
          AI Marketer <span className="mrai-emph">+</span> AI Strategist —{" "}
          <span style={{ opacity: 0.7 }}>Founder가 product에만 집중할 수 있는 단 하나의 AI 임원.</span>
        </p>
        <span className="mrai-cover__url">mr-ai.kr (예정) · markettwin.ai 기반 확장</span>

        <div className="mrai-cover__meta-row">
          <span className="mrai-cover__meta-label">제 안 자</span>
          <span className="mrai-cover__meta-value">Market Twin</span>
          <span className="mrai-cover__meta-label">제 안 대 상</span>
          <span className="mrai-cover__meta-value">FSN · 신임 대표</span>
          <span className="mrai-cover__meta-label">의 제</span>
          <span className="mrai-cover__meta-value">FSN 2026 AI Driven 전략 · 신사업 pivot vehicle</span>
          <span className="mrai-cover__meta-label">날 짜</span>
          <span className="mrai-cover__meta-value">2026 · 05</span>
        </div>
      </div>

      <div>
        <div className="mrai-cover__footer-rule" />
        <div className="mrai-cover__footer-line">
          <span>
            <strong>FSN AI PIVOT</strong> · Confidential
          </span>
          <span>01 / {String(totalPages).padStart(2, "0")}</span>
        </div>
      </div>
    </section>
  );
}
