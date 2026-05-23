import { Slide } from "../components/Slide";

/**
 * Slide 03 — WHY NOW · FSN's own direction.
 * FSN already publicly committed to "AI Driven 전략" + "브랜딩 컴퍼니
 * 체질 전환". Mr. AI is the natural execution vehicle. Position it as
 * the third axis next to 부스터즈 (brand assets) and 카울리 (ad media).
 */
export function FSNDirection({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  return (
    <Slide variant="light" sectionLabel="A · WHY NOW" pageNumber={pageNumber} totalPages={totalPages}>
      <h2 className="mrai-slide__title">
        FSN의 2026 전략 = <span className="mrai-emph">AI Driven</span>.
        <br />Mr. AI는 그 <span className="mrai-emph">execution vehicle</span>.
      </h2>
      <div className="mrai-slide__rule" />
      <p className="mrai-slide__subtitle" style={{ marginBottom: 28 }}>
        FSN은 이미 "브랜딩 컴퍼니로 체질 전환" + "AI Driven 전략"을 공식화. 부스터즈가 <span className="mrai-emph">브랜드 자산</span>의
        2nd 축이라면, Mr. AI는 <span className="mrai-emph">AI 운영 인프라</span>의 3rd 축으로 자연스럽게 정착.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18, marginBottom: 28 }}>
        <div className="mrai-card">
          <div className="mrai-card__label">1ST AXIS · 기존</div>
          <div className="mrai-card__title">카울리</div>
          <div className="mrai-card__body">
            모바일 광고 매체 플랫폼 · FSN의 원조 사업
            <br />
            <span style={{ color: "var(--mrai-ink-muted-light)", fontSize: 12 }}>
              광고 인벤토리 매칭 · advertiser ↔ publisher 중개
            </span>
          </div>
        </div>
        <div className="mrai-card">
          <div className="mrai-card__label">2ND AXIS · 현재 성장 동력</div>
          <div className="mrai-card__title">부스터즈</div>
          <div className="mrai-card__body">
            K-브랜드 인큐베이션 (르무통·링티·디닥넥)
            <br />
            <span style={{ color: "var(--mrai-ink-muted-light)", fontSize: 12 }}>
              브랜드 자산 보유 · 사상 최대 분기 매출 견인
            </span>
          </div>
        </div>
        <div className="mrai-card" style={{ background: "rgba(245,158,11,0.08)", borderColor: "var(--mrai-accent)" }}>
          <div className="mrai-card__label" style={{ color: "var(--mrai-accent)" }}>3RD AXIS · 제안</div>
          <div className="mrai-card__title">
            <span className="mrai-emph">Mr. AI</span>
          </div>
          <div className="mrai-card__body" style={{ color: "var(--mrai-ink-on-light)", fontWeight: 500 }}>
            AI 운영 OS — 부스터즈 K-브랜드 자체 운영 자동화
            <br />
            <span style={{ fontWeight: 400, fontSize: 12 }}>
              FSN 광고주 base에 외부 sell · 동남아 동시 진출
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 24, alignItems: "start" }}>
        <div className="mrai-card" style={{ background: "var(--mrai-bg-dark)", borderColor: "var(--mrai-bg-dark)", color: "var(--mrai-ink-on-dark)", padding: "20px 24px" }}>
          <div className="mrai-card__label" style={{ color: "var(--mrai-accent)" }}>FSN 2026 공식 메시지</div>
          <p style={{ fontSize: 16, lineHeight: 1.55, color: "var(--mrai-ink-on-dark)", margin: "8px 0 0", fontWeight: 500 }}>
            "Marketing · Data 노하우와 <span className="mrai-emph">AI Driven 전략</span>으로 광고주 · 브랜드 · 플랫폼과 함께 상생하며 성장합니다."
          </p>
          <p style={{ fontSize: 12, color: "var(--mrai-ink-muted-dark)", marginTop: 12, lineHeight: 1.5 }}>
            "FSN, 브랜딩 컴퍼니로 체질 전환…부스터즈 중심 실적 턴어라운드"
            <br />
            <span style={{ opacity: 0.7 }}>— 아시아경제 2026.3</span>
          </p>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--mrai-accent)", marginBottom: 14 }}>
            왜 Mr. AI = 자연스러운 fit
          </div>
          <ul style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 14, lineHeight: 1.55, paddingLeft: 0, listStyle: "none" }}>
            <li>
              <span style={{ color: "var(--mrai-accent)", fontWeight: 700, marginRight: 8 }}>01</span>
              FSN 공식 "AI Driven" 메시지 = Mr. AI가 그 메시지의 <span className="mrai-emph">유형의 product</span>. 슬로건을 실제 사업으로.
            </li>
            <li>
              <span style={{ color: "var(--mrai-accent)", fontWeight: 700, marginRight: 8 }}>02</span>
              부스터즈 K-브랜드 = Mr. AI의 <span className="mrai-emph">first internal customer</span>. 르무통·링티 운영 비용 ↓, 일본 진출 의사결정 ↑.
            </li>
            <li>
              <span style={{ color: "var(--mrai-accent)", fontWeight: 700, marginRight: 8 }}>03</span>
              카울리 광고 인프라 = Mr. AI Marketing module의 <span className="mrai-emph">광고 집행 백엔드</span>로 직접 활용. 경쟁사 못 가짐.
            </li>
            <li>
              <span style={{ color: "var(--mrai-accent)", fontWeight: 700, marginRight: 8 }}>04</span>
              동남아 5개국 자회사 = Mr. AI 글로벌 진출 <span className="mrai-emph">native 인프라</span>. DOJO · Daydream · Klaviyo는 아시아 진출까지 1-2년 더 필요.
            </li>
          </ul>
        </div>
      </div>

      <div style={{ marginTop: "auto", paddingTop: 16, fontSize: 11, color: "var(--mrai-ink-muted-light)", letterSpacing: 0.5 }}>
        출처 — FSN 공식 (fsn.co.kr) · 아시아경제 2026.3 "FSN 브랜딩 컴퍼니 체질 전환" · Dealsite 2026 "FSN 사상 최대 분기 매출 — 링티·르무통"
      </div>
    </Slide>
  );
}
