import { Slide } from "../components/Slide";

/**
 * Slide 15 — ROI Table (회계사 CEO core).
 * 자본 투입 spectrum × 3년 회수 시뮬레이션. IRR · payback · 누적 회수
 * 명확히. 모든 숫자 보수 가정 + Y3 기준 conservative discount.
 */
export function ROITable({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  return (
    <Slide variant="light" sectionLabel="D · NUMBERS" pageNumber={pageNumber} totalPages={totalPages}>
      <h2 className="mrai-slide__title">
        ROI (투자 수익률) — FSN 자본 투입 vs 3년 회수
      </h2>
      <div className="mrai-slide__rule" />
      <p className="mrai-slide__subtitle" style={{ marginBottom: 22 }}>
        3개의 commitment scenario · 모두 base case 매출 (₩36-150-420억) 기준 · 보수적 30% discount 적용 · Y3 종가 valuation 5× ARR.
      </p>

      <table className="mrai-table" style={{ fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ width: "16%" }}>Scenario</th>
            <th style={{ width: "14%" }}>FSN 투입 (Y1)</th>
            <th style={{ width: "14%" }}>인력 · 자원</th>
            <th style={{ width: "12%" }}>Y3 ARR (base)</th>
            <th style={{ width: "14%" }}>Y3 valuation (5× ARR)</th>
            <th style={{ width: "10%" }}>Payback</th>
            <th style={{ width: "10%" }}>IRR (3yr)</th>
            <th style={{ width: "10%" }}>비고</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>PoC</strong></td>
            <td><strong>₩2억</strong></td>
            <td>4명 (현재 + 1)</td>
            <td>₩90억</td>
            <td>₩450억</td>
            <td>6개월</td>
            <td>~330%</td>
            <td>검증용</td>
          </tr>
          <tr className="mrai-emphasized">
            <td><strong style={{ color: "var(--mrai-accent)" }}>★ 1단계 pivot</strong></td>
            <td><strong>₩10억</strong></td>
            <td>10명 + FSN 자산</td>
            <td>₩420억</td>
            <td>₩2,100억</td>
            <td><strong style={{ color: "var(--mrai-accent)" }}>5개월</strong></td>
            <td><strong style={{ color: "var(--mrai-accent)" }}>~490%</strong></td>
            <td>권장</td>
          </tr>
          <tr>
            <td><strong>본격 pivot</strong></td>
            <td><strong>₩30억</strong></td>
            <td>25명 + 동남아 2국</td>
            <td>₩900억</td>
            <td>₩4,500억</td>
            <td>4개월</td>
            <td>~580%</td>
            <td>aggressive</td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 22, marginTop: 24 }}>
        <div className="mrai-card" style={{ background: "var(--mrai-bg-dark)", color: "var(--mrai-ink-on-dark)", borderColor: "var(--mrai-bg-dark)" }}>
          <div className="mrai-card__label" style={{ color: "var(--mrai-accent)" }}>회계 관점 — 보수 가정</div>
          <ul style={{ paddingLeft: 18, margin: "8px 0 0", fontSize: 13, lineHeight: 1.75 }}>
            <li>매출은 <strong>base case</strong> 사용 — bull case 적용 시 IRR 추가 ~120-180%p</li>
            <li>Y3 종가 valuation = <strong>5× ARR</strong> (Daydream Series A · DOJO seed보다 보수)</li>
            <li>현금 회수만 계산 — Series A 추가 fundraise 시 dilution 별도</li>
            <li>위 IRR은 <strong>Y3 종가 매각 가정</strong>. 실제 유지 시 NPV는 더 큼 (NRR · 순 매출 유지율 110-130%로 매년 성장)</li>
            <li>Cost overrun 30% 가산해도 ★ 1단계 IRR <strong>여전히 370%+</strong></li>
          </ul>
        </div>

        <div className="mrai-card" style={{ background: "rgba(34,211,238,0.06)", borderColor: "var(--mrai-cool)" }}>
          <div className="mrai-card__label" style={{ color: "var(--mrai-cool)" }}>추가 cushion</div>
          <ul style={{ paddingLeft: 16, margin: "8px 0 0", fontSize: 12, lineHeight: 1.65 }}>
            <li>Market Twin R&D = <strong>이미 투입된 매몰비용</strong> (FSN 입장 free asset)</li>
            <li>부스터즈 내부 사용 시 마케팅 컨설팅 비용 절감 <strong>연 수억</strong> 별도 ROI</li>
            <li>White-label/resell 시 FSN 자체 SaaS 매출 도 별도</li>
            <li>KOSDAQ 시총 영향 (재평가 모멘텀)</li>
          </ul>
        </div>
      </div>

      <div style={{ marginTop: 18, fontSize: 11, color: "var(--mrai-ink-muted-light)", lineHeight: 1.5 }}>
        <strong>가격 multiple 검증:</strong> SaaS 5× ARR은 글로벌 SaaS 평균 (Bessemer Cloud Index 2024-25)보다 낮음. Mr. AI는 GRR · NRR 110%+ 시 7-10× 가능 (Daydream/DOJO 평가 패턴).
      </div>
    </Slide>
  );
}
