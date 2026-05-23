import { Slide } from "../components/Slide";

/**
 * Slide 14 — Unit Economics + 3-Year Revenue.
 * Three scenarios (conservative / base / bullish). All numbers
 * tabular-nums for accountant CEO scrutiny. 가격 spectrum 4-tier.
 */
export function UnitEconomics({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  return (
    <Slide variant="light" sectionLabel="D · NUMBERS" pageNumber={pageNumber} totalPages={totalPages}>
      <h2 className="mrai-slide__title">
        Unit Economics + <span className="mrai-emph">3-Year Revenue 시나리오</span>
      </h2>
      <div className="mrai-slide__rule" />
      <p className="mrai-slide__subtitle" style={{ marginBottom: 22 }}>
        보수 / 기본 / 공격 3 case · 모든 가정 명시 · FSN warm-intro 기반 conversion · ARPU 50% free→paid 보정.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.4fr", gap: 24 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.18em", color: "var(--mrai-accent)", marginBottom: 10, textTransform: "uppercase" }}>가격 spectrum · ARPU mix</div>
          <table className="mrai-table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th>Tier</th>
                <th>월 가격</th>
                <th>Mix</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Starter (1-3인)</td><td>₩299천-899천</td><td>30%</td><td>self-serve · long tail</td></tr>
              <tr><td>Growth (10-30인)</td><td>₩1.5M-4.5M</td><td>45%</td><td>FSN advertiser 대다수</td></tr>
              <tr><td>Enterprise (30+)</td><td>₩9M-30M</td><td>20%</td><td>custom · sales-led</td></tr>
              <tr><td>White-label (FSN 자체)</td><td>license + RS</td><td>5%</td><td>고마진 채널</td></tr>
              <tr className="mrai-emphasized"><td colSpan={4}><strong>Weighted ARPU 실효 ≈ ₩3.6M/월 (~$2,640)</strong></td></tr>
            </tbody>
          </table>

          <div style={{ marginTop: 14, fontSize: 13, fontWeight: 600, letterSpacing: "0.18em", color: "var(--mrai-accent)", marginBottom: 10, textTransform: "uppercase" }}>Unit economics</div>
          <table className="mrai-table" style={{ fontSize: 12 }}>
            <tbody>
              <tr><td>CAC (고객 획득 비용 · warm intro 기준)</td><td><strong>₩200천-500천</strong></td></tr>
              <tr><td>Gross margin</td><td>78-82% (LLM 비용 ~18%)</td></tr>
              <tr><td>Payback period</td><td><strong>1-2개월</strong></td></tr>
              <tr><td>NRR (순 매출 유지율)</td><td>110-130% (Net Revenue Retention · enterprise)</td></tr>
              <tr><td>LTV (고객 생애 가치 · 24개월 평균)</td><td>~₩84M</td></tr>
              <tr><td>LTV / CAC 배수</td><td><strong style={{ color: "var(--mrai-accent)" }}>168× - 420×</strong> (SaaS 건전 3+)</td></tr>
            </tbody>
          </table>
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.18em", color: "var(--mrai-accent)", marginBottom: 10, textTransform: "uppercase" }}>3-Year ARR (연 반복 매출) 시나리오 (₩억)</div>
          <table className="mrai-table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ width: "18%" }}>Case</th>
                <th style={{ width: "20%" }}>Y1</th>
                <th style={{ width: "20%" }}>Y2</th>
                <th style={{ width: "20%" }}>Y3</th>
                <th style={{ width: "22%" }}>Y3 ARR / 직접 매출</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>보수 (Bear)</strong></td>
                <td>유료 12곳 · ARR ₩18억</td>
                <td>40곳 · ₩60억</td>
                <td>100곳 · ₩150억</td>
                <td><strong>₩150억</strong></td>
              </tr>
              <tr className="mrai-emphasized">
                <td><strong>기본 (Base)</strong></td>
                <td>유료 20곳 · ARR ₩36억</td>
                <td>80곳 · ₩150억</td>
                <td>200곳 · ₩420억</td>
                <td><strong style={{ color: "var(--mrai-accent)" }}>₩420억</strong></td>
              </tr>
              <tr>
                <td><strong>공격 (Bull)</strong></td>
                <td>유료 30곳 · ARR ₩60억</td>
                <td>150곳 · ₩300억</td>
                <td>400곳 · ₩900억</td>
                <td><strong>₩900억</strong></td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: 12, fontSize: 11, color: "var(--mrai-ink-muted-light)", lineHeight: 1.55 }}>
            <strong>가정:</strong> Y1 = FSN warm-intro 전환만, Y2 = 외부 sales 시작 + 동남아 2국 진입, Y3 = self-serve PLG + 동남아 4국 누적.
            모든 시나리오에서 Series A 90-150억 LOI 가능 수준.
          </div>

          <div style={{ marginTop: 16, padding: "14px 18px", background: "rgba(245,158,11,0.08)", border: "1px solid var(--mrai-accent)", borderRadius: 10, fontSize: 13, lineHeight: 1.6 }}>
            <span style={{ color: "var(--mrai-accent)", fontWeight: 700, marginRight: 10 }}>SMB PLG SaaS 비교</span>
            Jasper · Copy.ai · DOJO AI 같은 PLG 패턴: 12개월 유료 1,000-5,000명, ARPU $50-200/월.<br />
            Mr. AI Y1 base 36억 (유료 20곳, ARPU 1,800만/월) — <span className="mrai-emph">사용자 수 1/50, ARPU 90배</span>. Enterprise economics 우월.
          </div>
        </div>
      </div>

      <div style={{ marginTop: "auto", paddingTop: 14, fontSize: 11, color: "var(--mrai-ink-muted-light)", lineHeight: 1.5 }}>
        벤치마크: OpenView SaaS Benchmark 2024 (SMB CAC $50-200, LTV/CAC 3+ 건전), HubSpot Sales Benchmark 2024 (warm-intro B2B 30-40%), Notion 12개월 0.3% PLG 침투율.
      </div>
    </Slide>
  );
}
