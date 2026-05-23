import { Slide } from "../components/Slide";

/**
 * Slide 02 — WHY NOW · Market Timing.
 * Show the AI-Marketing-Agent space funding wave (DOJO/Daydream/Athena/
 * Klaviyo agent) — every major player just raised in past 12 months,
 * none have a Korea entry. This is the "if not us, somebody else" beat.
 */
export function MarketTiming({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  return (
    <Slide variant="light" sectionLabel="A · WHY NOW" pageNumber={pageNumber} totalPages={totalPages}>
      <h2 className="mrai-slide__title">
        AI Marketing Agent 시장 — <span className="mrai-emph">12개월간 폭발</span>,
        <br />한국 진출 기업은 <span className="mrai-emph">없음</span>.
      </h2>
      <div className="mrai-slide__rule" />
      <p className="mrai-slide__subtitle" style={{ marginBottom: 28 }}>
        2025-2026 직전 12개월간 글로벌 Agentic Marketing 공간에서 8개+ 회사가 시드~시리즈 D를 조달 (Hightouch $150M @ $2.75B val 최대).
        한국에 본사를 둔 player는 0. <span className="mrai-emph">지금이 한국 native enterprise-grade 진입의 last entry window.</span>
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 36, alignItems: "stretch" }}>
        <table className="mrai-table">
          <thead>
            <tr>
              <th style={{ width: "30%" }}>회사</th>
              <th style={{ width: "30%" }}>카테고리</th>
              <th style={{ width: "40%" }}>최근 funding · 시점</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Hightouch</strong></td>
              <td>Agentic Marketing Platform</td>
              <td>$150M Series D @ $2.75B val · 2026.3</td>
            </tr>
            <tr>
              <td><strong>Bluefish</strong></td>
              <td>Agentic Marketing · F500</td>
              <td>$43M Series B · 누적 $68M · 2026</td>
            </tr>
            <tr>
              <td><strong>DOJO AI</strong></td>
              <td>Marketing OS · Multi-Agent</td>
              <td>$6M seed @ $30M val · 2026.4</td>
            </tr>
            <tr>
              <td><strong>Daydream</strong></td>
              <td>SEO·Search 에이전트</td>
              <td>$15M Series A · 2026.4 · 누적 $21M</td>
            </tr>
            <tr>
              <td><strong>Athena by Zeta</strong></td>
              <td>Enterprise Superintelligent Agent</td>
              <td>Zeta Live 2025.10 · GA 2026.3</td>
            </tr>
            <tr>
              <td><strong>Klaviyo Marketing Agent</strong></td>
              <td>B2C CRM · 이커머스 자율 캠페인</td>
              <td>K:BOS 2025.9 · Composer 2026 Q1</td>
            </tr>
            <tr>
              <td><strong>HubSpot Breeze</strong></td>
              <td>풀스택 CRM + AI Agents</td>
              <td>INBOUND 2024 · Spring 2025/2026 확장</td>
            </tr>
            <tr>
              <td><strong>Jasper</strong></td>
              <td>AI 콘텐츠 · workflow</td>
              <td>$131M 누적 · $1.5-1.7B val · 2022-2025</td>
            </tr>
            <tr className="mrai-emphasized">
              <td>한국 진출 player</td>
              <td colSpan={2}>
                <span style={{ color: "var(--mrai-accent)", fontWeight: 700 }}>없음</span> · 한국 native enterprise-grade entry 0
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="mrai-card">
            <div className="mrai-card__label">시장 사이즈 (Grand View 2025)</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: "var(--mrai-accent)", lineHeight: 1, marginBottom: 4 }}>
              $154.6B
            </div>
            <div className="mrai-card__body">
              글로벌 SEO/Marketing OS 2030 전망 · 2024 $74.6B · CAGR{" "}
              <span className="mrai-emph">13.5%</span>
            </div>
          </div>
          <div className="mrai-card">
            <div className="mrai-card__label">SMB 세그먼트 비중</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: "var(--mrai-accent)", lineHeight: 1, marginBottom: 4 }}>
              $19B
            </div>
            <div className="mrai-card__body">
              마케팅 자동화 $47B 中 SMB 40% 비중 · 가장 빠르게 성장하는 segment
            </div>
          </div>
          <div className="mrai-card" style={{ background: "rgba(245,158,11,0.07)", borderColor: "var(--mrai-accent)" }}>
            <div className="mrai-card__label" style={{ color: "var(--mrai-accent)" }}>FSN의 entry window</div>
            <div className="mrai-card__body" style={{ color: "var(--mrai-ink-on-light)", fontWeight: 500 }}>
              미국 player는 한국 진출 의향 낮음 (시장 size · 언어 장벽).
              한국 player가 enterprise-grade로 먼저 잡으면 <span className="mrai-emph">FSN이 카테고리 한국 native winner</span>.
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: "auto", paddingTop: 16, fontSize: 10, color: "var(--mrai-ink-muted-light)", letterSpacing: 0.4, lineHeight: 1.5 }}>
        출처 — Grand View 2025 · MarketsandMarkets 2025 · Hightouch BusinessWire 2026.4 · Bluefish PR Newswire 2026 · DOJO AI FinSMEs 2026.4 · Daydream PR Newswire 2026.4 · Zeta Global IR 2026.3 · Klaviyo IR 2025.9 + Q1 2026 · HubSpot INBOUND 2024 · Jasper Crunchbase 2025
      </div>
    </Slide>
  );
}
