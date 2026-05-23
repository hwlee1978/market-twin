import { Slide } from "../components/Slide";

/**
 * Slide 12 — Global Path.
 * FSN's existing Southeast Asia subsidiary network gives Mr. AI a
 * native-language launch pad that DOJO/Daydream/Klaviyo would take
 * 1-2 yrs to approximate. Pair this with Market Twin's per-country
 * simulation capability and the global advantage compounds.
 */
export function GlobalPath({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  const countries = [
    { iso: "JP", name: "일본", role: "첫 사례 (르무통 진출 진행 중)", priority: 1 },
    { iso: "TH", name: "태국", role: "FSN 자회사 운영 중", priority: 2 },
    { iso: "VN", name: "베트남", role: "FSN 자회사 운영 중", priority: 2 },
    { iso: "SG", name: "싱가포르", role: "FSN 자회사 · enterprise hub", priority: 2 },
    { iso: "TW", name: "대만", role: "FSN 자회사 운영 중", priority: 3 },
    { iso: "CN", name: "중국", role: "FSN 자회사 운영 중", priority: 3 },
  ];
  return (
    <Slide variant="light" sectionLabel="C · WHY FSN ONLY" pageNumber={pageNumber} totalPages={totalPages}>
      <h2 className="mrai-slide__title">
        Global Path — <span className="mrai-emph">동남아 native</span>로 출발
      </h2>
      <div className="mrai-slide__rule" />
      <p className="mrai-slide__subtitle" style={{ marginBottom: 24 }}>
        FSN은 이미 6개국에 자회사 + 인력 + 광고주 보유. DOJO · Daydream · Klaviyo는 아시아 진출까지 1-2년 더 걸림.
        Mr. AI는 출시 직후 동남아 5개국에 native-language로 진입 가능 + Market Twin이 시장별 시뮬 답.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 28 }}>
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
            {countries.map((c) => (
              <div key={c.iso} className="mrai-card" style={{
                padding: "14px 16px",
                background: c.priority === 1 ? "rgba(245,158,11,0.08)" : "var(--mrai-card-light)",
                borderColor: c.priority === 1 ? "var(--mrai-accent)" : "var(--mrai-rule-light)",
              }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--mrai-accent)", fontWeight: 700, letterSpacing: "0.1em" }}>{c.iso}</span>
                  {c.priority === 1 && <span style={{ fontSize: 10, padding: "2px 8px", background: "var(--mrai-accent)", color: "var(--mrai-bg-dark)", borderRadius: 4, fontWeight: 700 }}>P1</span>}
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "var(--mrai-ink-muted-light)", lineHeight: 1.4 }}>{c.role}</div>
              </div>
            ))}
          </div>

          <div className="mrai-card" style={{ background: "var(--mrai-bg-dark)", color: "var(--mrai-ink-on-dark)", borderColor: "var(--mrai-bg-dark)" }}>
            <div className="mrai-card__label" style={{ color: "var(--mrai-accent)" }}>Global launch 시퀀스</div>
            <ol style={{ paddingLeft: 18, margin: "8px 0 0", fontSize: 13, lineHeight: 1.75, color: "var(--mrai-ink-on-dark)" }}>
              <li><strong>M0-3:</strong> 한국 + 일본 (르무통 첫 사례) — Mr. AI 자체 검증</li>
              <li><strong>M4-6:</strong> 싱가포르 + 태국 — FSN 자회사 광고주 base 통한 enterprise pilot</li>
              <li><strong>M7-9:</strong> 베트남 + 대만 — K-브랜드 글로벌 진출 가속</li>
              <li><strong>M10-12:</strong> 중국 — 별도 partnership 검토 (규제 환경 따라)</li>
            </ol>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="mrai-card">
            <div className="mrai-card__label">글로벌 경쟁사 아시아 진출 격차</div>
            <table style={{ width: "100%", fontSize: 12 }}>
              <thead style={{ color: "var(--mrai-accent)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                <tr><th style={{ textAlign: "left", paddingBottom: 6 }}>경쟁사</th><th style={{ textAlign: "right", paddingBottom: 6 }}>아시아 진출 격차</th></tr>
              </thead>
              <tbody>
                <tr><td>Klaviyo Mktg Agent (NYSE)</td><td style={{ textAlign: "right" }}><strong>+ 12개월 (e-commerce only)</strong></td></tr>
                <tr><td>Daydream (US Series A)</td><td style={{ textAlign: "right" }}><strong>+ 12-18개월</strong></td></tr>
                <tr><td>DOJO AI (US seed)</td><td style={{ textAlign: "right" }}><strong>+ 18-24개월</strong></td></tr>
                <tr><td>HubSpot Breeze · Marketo</td><td style={{ textAlign: "right" }}>이미 있지만 enterprise only</td></tr>
                <tr style={{ background: "rgba(245,158,11,0.08)" }}><td><strong>Mr. AI</strong></td><td style={{ textAlign: "right" }}><strong style={{ color: "var(--mrai-accent)" }}>출시 즉시 6개국</strong></td></tr>
              </tbody>
            </table>
          </div>
          <div className="mrai-card" style={{ background: "rgba(34,211,238,0.06)", borderColor: "var(--mrai-cool)" }}>
            <div className="mrai-card__label" style={{ color: "var(--mrai-cool)" }}>Market Twin 곱하기 효과</div>
            <p style={{ fontSize: 13, lineHeight: 1.55, margin: "8px 0 0" }}>
              각 동남아 시장 진출 시 Market Twin이 "어느 segment? 어느 가격? 어느 채널?" 답.
              FSN advertiser에게는 단순 SaaS가 아닌 <strong>전략 컨설팅 포함 product</strong>로 sell.
            </p>
          </div>
          <div className="mrai-card" style={{ background: "rgba(245,158,11,0.06)", borderColor: "var(--mrai-accent)" }}>
            <div className="mrai-card__label" style={{ color: "var(--mrai-accent)" }}>K-브랜드 글로벌 확산 vehicle</div>
            <p style={{ fontSize: 13, lineHeight: 1.55, margin: "8px 0 0" }}>
              부스터즈가 만든 K-브랜드 → Mr. AI가 글로벌로 자동 운영. 정부 K-Content / K-Beauty / K-Wellness 정책과 정합.
            </p>
          </div>
        </div>
      </div>
    </Slide>
  );
}
