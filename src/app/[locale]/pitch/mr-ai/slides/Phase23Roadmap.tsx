import { Slide } from "../components/Slide";

/**
 * Slide 17 — Phase 2-3 Roadmap · M7-M24.
 * Quarterly milestones from external sell-in to global expansion to
 * Series A. Tied to the ARR scenarios in the previous numbers slide.
 */
export function Phase23Roadmap({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  return (
    <Slide variant="light" sectionLabel="E · ROADMAP" pageNumber={pageNumber} totalPages={totalPages}>
      <h2 className="mrai-slide__title">
        Phase 2-3 — <span className="mrai-emph">외부 sell + 동남아 + Series A</span>
      </h2>
      <div className="mrai-slide__rule" />
      <p className="mrai-slide__subtitle" style={{ marginBottom: 28 }}>
        분기 milestone · 모든 지표는 base case 시나리오 기준 · FSN 자산 활용도 매 단계 누적.
      </p>

      <table className="mrai-table" style={{ fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ width: "12%" }}>분기</th>
            <th style={{ width: "20%" }}>주요 milestone</th>
            <th style={{ width: "20%" }}>FSN 자산 활용</th>
            <th style={{ width: "12%" }}>유료 customer</th>
            <th style={{ width: "12%" }}>ARR (base)</th>
            <th style={{ width: "24%" }}>달성 조건</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Q3 (M7-9)</strong></td>
            <td>외부 sales 시작 · 광고주 5-10곳 pilot</td>
            <td>FSN 대표 introduction · 카울리 광고주</td>
            <td>5-8곳</td>
            <td>₩6-15억</td>
            <td>Phase 1 case study 확보</td>
          </tr>
          <tr>
            <td><strong>Q4 (M10-12)</strong></td>
            <td>일본 launch (르무통 첫 사례 활용) · 한국 enterprise pilot 확장</td>
            <td>일본 r무통 reference · FSN 일본 자회사</td>
            <td>20곳</td>
            <td>₩36억 (Y1 종료)</td>
            <td>일본 첫 paying enterprise customer</td>
          </tr>
          <tr className="mrai-emphasized">
            <td><strong>Q5 (M13-15)</strong></td>
            <td>싱가포르 + 태국 enterprise pilot</td>
            <td>FSN 동남아 자회사 introduction</td>
            <td>40곳</td>
            <td>₩75억</td>
            <td>Series A LOI 협의 · 90-150억</td>
          </tr>
          <tr>
            <td><strong>Q6 (M16-18)</strong></td>
            <td>White-label · FSN AI 솔루션 출시</td>
            <td>FSN 자체 service offering · 카울리 통합</td>
            <td>60곳</td>
            <td>₩105억</td>
            <td>White-label 첫 deal closing</td>
          </tr>
          <tr>
            <td><strong>Q7 (M19-21)</strong></td>
            <td>베트남 + 대만 진출 · K-브랜드 4개+ Mr. AI 운영</td>
            <td>부스터즈 모든 brand Mr. AI 가동</td>
            <td>100곳</td>
            <td>₩150억 (Y2 종료)</td>
            <td>NRR 110%+ 달성</td>
          </tr>
          <tr style={{ background: "rgba(245,158,11,0.06)" }}>
            <td><strong>Q8 (M22-24)</strong></td>
            <td><strong>Series A 클로징 · 글로벌 가속</strong></td>
            <td>KOSDAQ 시총 모멘텀 · investor IR</td>
            <td><strong>150곳</strong></td>
            <td><strong style={{ color: "var(--mrai-accent)" }}>₩240억</strong></td>
            <td><strong>Series A 90-150억 raise + Y3 ₩420억 ARR 진로</strong></td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 22 }}>
        <div className="mrai-card">
          <div className="mrai-card__label">위험 1 · LLM 비용 폭발</div>
          <p style={{ fontSize: 12, lineHeight: 1.55, margin: "6px 0 0" }}>
            대응: prompt caching 이미 -31% · selective Haiku · persona pool 재사용. Y2까지 마진 -2-3%p 영향 한정.
          </p>
        </div>
        <div className="mrai-card">
          <div className="mrai-card__label">위험 2 · 경쟁사 한국 진입</div>
          <p style={{ fontSize: 12, lineHeight: 1.55, margin: "6px 0 0" }}>
            대응: FSN 광고주 base + 동남아 5개국으로 6-12개월 안에 lock-in. Persistent Memory가 switching cost.
          </p>
        </div>
        <div className="mrai-card">
          <div className="mrai-card__label">위험 3 · enterprise sales cycle</div>
          <p style={{ fontSize: 12, lineHeight: 1.55, margin: "6px 0 0" }}>
            대응: FSN warm intro로 3-6개월 cycle을 1-2개월로 단축. PoC 무료 30일로 진입장벽 ↓.
          </p>
        </div>
      </div>
    </Slide>
  );
}
