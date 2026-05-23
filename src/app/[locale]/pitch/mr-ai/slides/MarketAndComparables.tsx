import { Slide } from "../components/Slide";

/**
 * Slide 13 — Market + Comparables.
 * 회계사 CEO가 가장 먼저 확인할 것: "그래서 시장 얼마야? 비슷한
 * 회사들은 얼마 받았어?" — 1차 출처 명확히 명시.
 */
export function MarketAndComparables({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  return (
    <Slide variant="light" sectionLabel="D · NUMBERS" pageNumber={pageNumber} totalPages={totalPages}>
      <h2 className="mrai-slide__title">
        시장 + Comparables — <span className="mrai-emph">$154.6B</span> · 시드~시리즈 A $5-60M
      </h2>
      <div className="mrai-slide__rule" />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="mrai-card">
            <div className="mrai-card__label">TAM · 글로벌 SEO/Marketing OS</div>
            <div style={{ fontSize: 44, fontWeight: 800, color: "var(--mrai-accent)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>$154.6B</div>
            <div style={{ fontSize: 13, color: "var(--mrai-ink-muted-light)", marginTop: 6, lineHeight: 1.45 }}>
              2030 전망 · 2024 $74.6B · CAGR <strong>13.5%</strong>
              <br />
              <span style={{ fontSize: 11 }}>출처 Grand View Research 2025</span>
            </div>
          </div>

          <div className="mrai-card">
            <div className="mrai-card__label">SAM · SMB 마케팅 자동화</div>
            <div style={{ fontSize: 44, fontWeight: 800, color: "var(--mrai-accent)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>$19B</div>
            <div style={{ fontSize: 13, color: "var(--mrai-ink-muted-light)", marginTop: 6, lineHeight: 1.45 }}>
              마케팅 자동화 $47B 中 SMB 40%
              <br />
              <span style={{ fontSize: 11 }}>출처 MarketsandMarkets 2025</span>
            </div>
          </div>

          <div className="mrai-card" style={{ background: "rgba(245,158,11,0.06)", borderColor: "var(--mrai-accent)" }}>
            <div className="mrai-card__label" style={{ color: "var(--mrai-accent)" }}>SOM · 한국 + 동남아 enterprise (보수)</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: "var(--mrai-accent)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>₩200-400억</div>
            <div style={{ fontSize: 13, color: "var(--mrai-ink-on-light)", marginTop: 6, lineHeight: 1.45 }}>
              한국 디지털 마케팅 시장 약 11조 中 AI/자동화 침투 2-3% × FSN 채널 도달 segment
              <br />
              <span style={{ fontSize: 11, color: "var(--mrai-ink-muted-light)" }}>출처 TreeSoop 추정 보정 · 방송광고진흥공사 2024</span>
            </div>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.18em", color: "var(--mrai-accent)", marginBottom: 12, textTransform: "uppercase" }}>
            Comparable funding · valuation 벤치마크
          </div>
          <table className="mrai-table">
            <thead>
              <tr>
                <th style={{ width: "26%" }}>회사</th>
                <th style={{ width: "20%" }}>최근 funding</th>
                <th style={{ width: "16%" }}>시점</th>
                <th style={{ width: "38%" }}>Mr. AI 대비 위치</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Hightouch</strong></td>
                <td>$150M Series D @ $2.75B val</td>
                <td>2026.3</td>
                <td>Agentic Marketing 플랫폼 · 카테고리 leader</td>
              </tr>
              <tr>
                <td><strong>Bluefish</strong></td>
                <td>$43M Series B · 누적 $68M</td>
                <td>2026</td>
                <td>Fortune 500 10%+ 도입 · AI surface 최적화</td>
              </tr>
              <tr>
                <td><strong>DOJO AI</strong></td>
                <td>$6M seed @ $30M val</td>
                <td>2026.4</td>
                <td>Multi-Agent OS · 가장 유사 · 한국 부재</td>
              </tr>
              <tr>
                <td><strong>Daydream</strong></td>
                <td>$15M Series A (누적 $21M)</td>
                <td>2026.4</td>
                <td>SEO 에이전트 · Enterprise only ($25k-60k/월)</td>
              </tr>
              <tr>
                <td><strong>Klaviyo Mktg Agent</strong></td>
                <td>(in-house · NYSE KVYO)</td>
                <td>2025.9 + Composer 2026Q1</td>
                <td>B2C CRM 자율 캠페인 · 이메일/SMS 한정</td>
              </tr>
              <tr>
                <td><strong>HubSpot Breeze</strong></td>
                <td>(NYSE HUBS 시총 $30B+)</td>
                <td>INBOUND 2024 + 2025/26</td>
                <td>CRM 풀스택 + AI · 진입 가격 $20-3,600+</td>
              </tr>
              <tr>
                <td><strong>Jasper</strong></td>
                <td>$131M 누적 · $1.5-1.7B val</td>
                <td>2022-2025</td>
                <td>AI 글쓰기만 · category 좁음</td>
              </tr>
              <tr>
                <td><strong>Athena · Zeta</strong></td>
                <td>(NYSE ZETA · 모회사)</td>
                <td>Zeta Live 2025.10 · GA 2026.3</td>
                <td>Enterprise superintelligent agent · SMB 진입 불가</td>
              </tr>
              <tr className="mrai-emphasized">
                <td><strong style={{ color: "var(--mrai-accent)" }}>★ Mr. AI</strong></td>
                <td>FSN pivot vehicle</td>
                <td>2026.5+</td>
                <td><strong>한국 native + 동남아 6개국 + Market Twin layer</strong> = unique</td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: 16, padding: "12px 18px", background: "var(--mrai-bg-dark)", color: "var(--mrai-ink-on-dark)", borderRadius: 10, fontSize: 13, lineHeight: 1.55 }}>
            <span style={{ color: "var(--mrai-accent)", fontWeight: 700, marginRight: 12 }}>밸류에이션 시사점</span>
            DOJO AI 시드 $6M @ 2026.4 (pre-product) · Daydream Series A $15M @ 2025.
            Mr. AI는 <span className="mrai-emph">Market Twin 6개월 R&D + FSN 자산 통합</span>으로 출발 — 즉시 Series A 수준 평가 가능.
          </div>
        </div>
      </div>
    </Slide>
  );
}
