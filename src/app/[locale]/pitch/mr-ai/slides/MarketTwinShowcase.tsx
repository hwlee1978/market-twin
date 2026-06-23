import { Slide } from "../components/Slide";

/**
 * Slide 09 — Market Twin Capability Showcase.
 * Dedicated single-slide deep dive on the strategic-decision engine.
 * Use real metrics from Market Twin memory (v9-v11 benchmarks,
 * 33 fixtures, 27 reference seeds, 5-LLM ensemble).
 */
export function MarketTwinShowcase({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  return (
    <Slide variant="dark" sectionLabel="C · WHY FSN ONLY" pageNumber={pageNumber} totalPages={totalPages}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ color: "var(--mrai-accent)", fontSize: 12, letterSpacing: "0.22em", fontWeight: 600 }}>SECRET WEAPON</span>
        </div>
        <h2 style={{ fontSize: 48, lineHeight: 1.08, letterSpacing: "-0.025em", fontWeight: 800, marginBottom: 12, maxWidth: "95%" }}>
          Market Twin Engine —<br />
          <span className="mrai-emph">Mr. AI의 Strategic Layer</span>
        </h2>
        <div className="mrai-slide__rule" />
        <p style={{ fontSize: 17, lineHeight: 1.55, color: "var(--mrai-ink-muted-dark)", marginBottom: 28, maxWidth: "90%" }}>
          DOJO · Daydream · HubSpot · Klaviyo 누구도 가지지 못한 <span className="mrai-emph">6개월 사전 R&D 자산</span>.
          Market Twin이 이미 보유한 작동 엔진을 Mr. AI 아키텍처에 그대로 흡수.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
          <Stat value="5,000" unit="명" label="페르소나 (25 sims × 200 personas) × 24 시장 = 120,000 시장 평가 데이터" />
          <Stat value="27" unit="seed" label="정부 OpenData (KOSIS · BLS · e-Stat 등) × 24개국" />
          <Stat value="5" unit="LLM" label="Anthropic · OpenAI · Gemini · xAI · DeepSeek ensemble" />
          <Stat value="33" unit="fixture" label="ground truth benchmark · v11 mean 58.7 / paired t-test p&lt;0.01" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 20 }}>
          <div className="mrai-card" style={{ background: "rgba(241,245,249,0.04)", borderColor: "var(--mrai-rule-dark)" }}>
            <div className="mrai-card__label" style={{ color: "var(--mrai-accent)" }}>이미 작동 중 (production)</div>
            <ul style={{ paddingLeft: 18, margin: "8px 0 0", fontSize: 13, lineHeight: 1.85 }}>
              <li>✓ KOSIS · BLS · e-Stat · World Bank 정부 통계 27 seed 적용 (24개국)</li>
              <li>✓ Multi-LLM ensemble — bias 방어 + Top-2 dominance check</li>
              <li>✓ KOTRA · UN Comtrade · DART · 관세청 · Hofstede 외부 anchor 5개</li>
              <li>✓ Cross-validation PDF report (McKinsey 톤) — 18 페이지 자동</li>
              <li>✓ Anthropic prompt caching — 31% LLM 비용 절감 (이미 production)</li>
              <li>✓ Category-aware selective Haiku routing (pet/home)</li>
              <li>✓ Borderline detection — top-2 vs single-winner 자동 분기</li>
            </ul>
          </div>
          <div className="mrai-card" style={{ background: "rgba(245,158,11,0.10)", borderColor: "var(--mrai-accent)" }}>
            <div className="mrai-card__label" style={{ color: "var(--mrai-accent)" }}>Output — 5종 strategic answer</div>
            <ul style={{ paddingLeft: 18, margin: "8px 0 0", fontSize: 13, lineHeight: 1.8, color: "var(--mrai-ink-on-dark)" }}>
              <li><strong>&ldquo;어느 시장 1순위?&rdquo;</strong> — 5,000 페르소나 vote + 외부 데이터 cross-check</li>
              <li><strong>&ldquo;가격 ₩X면 어떤 반응?&rdquo;</strong> — 페르소나별 pricing sensitivity</li>
              <li><strong>&ldquo;어느 채널 우선?&rdquo;</strong> — 페르소나 채널 mention rate</li>
              <li><strong>&ldquo;리스크 5가지&rdquo;</strong> — 페르소나가 직접 objection 표현</li>
              <li><strong>&ldquo;정합성 매트릭스&rdquo;</strong> — 시뮬 vs 외부 데이터 alignment 점수</li>
            </ul>
          </div>
        </div>

        <div style={{ marginTop: "auto", paddingTop: 20, padding: "14px 22px", background: "rgba(245,158,11,0.10)", border: "1px solid var(--mrai-accent)", borderRadius: 10, fontSize: 14, lineHeight: 1.55, color: "var(--mrai-ink-on-dark)" }}>
          <span style={{ color: "var(--mrai-accent)", fontWeight: 700, marginRight: 12 }}>RAW COMPARISON</span>
          McKinsey 1주 시장 진출 컨설팅 <span className="mrai-emph">₩2-5억</span>, 결과 받는 데 4-6주.
          Market Twin 1번 시뮬 <span className="mrai-emph">₩5만</span>, 90분.
          AI 컨설팅 layer가 Mr. AI cost 수준으로 내려옴.
        </div>
      </div>
    </Slide>
  );
}

function Stat({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <div className="mrai-card" style={{ background: "rgba(241,245,249,0.04)", borderColor: "var(--mrai-rule-dark)" }}>
      <div style={{ display: "flex", alignItems: "baseline" }}>
        <span style={{ fontSize: 44, fontWeight: 800, color: "var(--mrai-accent)", lineHeight: 1, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{value}</span>
        <span style={{ fontSize: 16, fontWeight: 600, marginLeft: 4, color: "var(--mrai-ink-on-dark)" }}>{unit}</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--mrai-ink-muted-dark)", marginTop: 8, lineHeight: 1.45 }} dangerouslySetInnerHTML={{ __html: label }} />
    </div>
  );
}
