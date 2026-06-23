import { Slide } from "../components/Slide";

/**
 * Slide 11 — External Customer Pipeline.
 * FSN's existing advertiser base → Mr. AI sell-in funnel + conservative
 * conversion math. This is where the SaaS revenue story emerges from
 * inside FSN's incumbent relationships (no cold outreach needed).
 */
export function ExternalPipeline({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  return (
    <Slide variant="light" sectionLabel="C · WHY FSN ONLY" pageNumber={pageNumber} totalPages={totalPages}>
      <h2 className="mrai-slide__title">
        FSN 광고주 base → <span className="mrai-emph">Mr. AI 외부 customer pipeline</span>
      </h2>
      <div className="mrai-slide__rule" />
      <p className="mrai-slide__subtitle" style={{ marginBottom: 24 }}>
        글로벌 SaaS startup은 cold outreach + PLG (제품 주도 성장)로 6-12개월 시드 traction에 매달림. Mr. AI는 FSN 기존 신뢰 관계로 시작 — conversion 자릿수 다름.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 28 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.18em", color: "var(--mrai-accent)", marginBottom: 14, textTransform: "uppercase" }}>
            Pipeline funnel · 12개월 보수 추정
          </div>

          <FunnelStep
            stage="01"
            label="FSN 광고주 base"
            value="수백 곳"
            note="카울리 advertiser + 부스터즈 collab + FSN 자회사 네트워크"
          />
          <FunnelStep
            stage="02"
            label="Mr. AI 적합 segment"
            value="200곳"
            note="B2B 마케팅 운영 · AI 도입 의향 있는 mid-market+"
          />
          <FunnelStep
            stage="03"
            label="FSN 신임 대표 introduction"
            value="50곳"
            note="신임 대표 활용 enterprise sales · 1:1 미팅"
          />
          <FunnelStep
            stage="04"
            label="Pilot 도입"
            value="20곳"
            note="40% 전환 (warm intro 기준, B2B SaaS 벤치마크)"
            accent
          />
          <FunnelStep
            stage="05"
            label="유료 contract"
            value="12곳"
            note="60% 전환 · ARR (연 반복 매출) ₩18-36억 (월 ₩1.5M-3M × 12)"
            accent
          />

          <div style={{ marginTop: 16, padding: "10px 16px", background: "var(--mrai-bg-dark)", color: "var(--mrai-ink-on-dark)", borderRadius: 8, fontSize: 12 }}>
            <span style={{ color: "var(--mrai-accent)", fontWeight: 700, marginRight: 10 }}>비교</span>
            해외 SaaS 스타트업은 1년 동안 월 $50-100짜리 소액 가입자 <strong>1,000명</strong>을 모으는 게 평균. Mr. AI는 같은 1년에 <span className="mrai-emph">enterprise 12곳</span>만 따도 — 고객당 단가가 <strong>300배</strong>. 적은 고객, 더 큰 매출.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="mrai-card">
            <div className="mrai-card__label">Unfair vs SMB-tier 경쟁사</div>
            <ul style={{ paddingLeft: 16, margin: "8px 0 0", fontSize: 13, lineHeight: 1.7 }}>
              <li><strong>FSN brand</strong> — KOSDAQ 상장사 신뢰 (스타트업 못 가짐)</li>
              <li><strong>FSN 신임 대표</strong> — 회계사 출신 사업가, advertiser CEO들과 동급 대화</li>
              <li><strong>카울리 trust</strong> — 광고주들이 이미 FSN을 알고 있음</li>
              <li><strong>warm intro 100%</strong> — cold outreach 비용 0</li>
            </ul>
          </div>
          <div className="mrai-card" style={{ background: "rgba(34,211,238,0.06)", borderColor: "var(--mrai-cool)" }}>
            <div className="mrai-card__label" style={{ color: "var(--mrai-cool)" }}>White-label · resell 옵션</div>
            <p style={{ fontSize: 13, lineHeight: 1.55, margin: "8px 0 0" }}>
              Mr. AI를 FSN 자체 서비스 offering에 white-label 임베드 →{" "}
              <strong>&ldquo;FSN AI 마케팅 솔루션&rdquo;</strong> 으로 advertiser에게 sell. SaaS 구독료 + 마케팅 운영 fee 양쪽 수익.
            </p>
          </div>
          <div className="mrai-card" style={{ background: "rgba(245,158,11,0.06)", borderColor: "var(--mrai-accent)" }}>
            <div className="mrai-card__label" style={{ color: "var(--mrai-accent)" }}>가격 spectrum (TBD)</div>
            <table style={{ width: "100%", fontSize: 12 }}>
              <tbody>
                <tr><td>SMB · 자영업</td><td style={{ textAlign: "right" }}>₩299천-899천/월</td></tr>
                <tr><td>Growth · 10-30인</td><td style={{ textAlign: "right" }}><strong>₩1.5M-4.5M/월</strong></td></tr>
                <tr><td>Enterprise · 30인+</td><td style={{ textAlign: "right" }}>₩9M-30M+/월 · custom</td></tr>
                <tr><td>White-label (FSN 자체)</td><td style={{ textAlign: "right" }}>license + revenue share</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ marginTop: "auto", paddingTop: 16, fontSize: 11, color: "var(--mrai-ink-muted-light)", letterSpacing: 0.5 }}>
        Conversion 가정: warm-intro B2B SaaS 벤치마크 (OpenView SaaS Benchmark 2024 · HubSpot Sales Benchmark · 7-15% baseline → warm intro 40-60%로 상향)
      </div>
    </Slide>
  );
}

function FunnelStep({ stage, label, value, note, accent }: { stage: string; label: string; value: string; note: string; accent?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 14, alignItems: "center", padding: "10px 14px", marginBottom: 6, background: accent ? "rgba(245,158,11,0.06)" : "var(--mrai-card-light)", border: accent ? "1px solid var(--mrai-accent)" : "1px solid var(--mrai-rule-light)", borderRadius: 8 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--mrai-accent)", fontVariantNumeric: "tabular-nums" }}>{stage}</span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 11, color: "var(--mrai-ink-muted-light)", lineHeight: 1.4, marginTop: 2 }}>{note}</div>
      </div>
      <strong style={{ fontSize: 18, color: accent ? "var(--mrai-accent)" : "var(--mrai-ink-on-light)", fontVariantNumeric: "tabular-nums" }}>{value}</strong>
    </div>
  );
}
