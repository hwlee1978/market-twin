import { Slide } from "../components/Slide";

/**
 * Slide 18 — THE ASK.
 * Final slide. Dark variant (return-to-cover symmetry). Three concrete
 * decision points + immediate next action with date.
 *
 * Layout note (2026-05-23 fix): proposer/next-meeting footer was
 * position: absolute and overlapped with content cards above. Rewrote
 * as flex column with marginTop:auto pushing the footer block to the
 * natural bottom — content above flows freely without overlap.
 */
export function TheAsk({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  return (
    <Slide variant="dark" sectionLabel="E · THE ASK" pageNumber={pageNumber} totalPages={totalPages}>
      <span className="mrai-cover__tagline" style={{ marginTop: 0 }}>FINAL DECISION</span>
      <h2 style={{ fontSize: 56, lineHeight: 1.0, letterSpacing: "-0.035em", fontWeight: 800, marginTop: 18, marginBottom: 10 }}>
        Ask
      </h2>
      <p style={{ fontSize: 16, lineHeight: 1.5, color: "var(--mrai-ink-muted-dark)", marginBottom: 22, maxWidth: "85%" }}>
        3가지 결정 사항. 모두 회수 가능한 reversible 결정. 첫 단계는 ★ 1단계 pivot ₩10억 권장.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 18 }}>
        <AskCard
          num="01"
          title="자본 commitment"
          options={[
            { label: "PoC", value: "₩2억", desc: "검증용" },
            { label: "★ 1단계", value: "₩10억", desc: "권장", highlight: true },
            { label: "본격 pivot", value: "₩30억", desc: "공격" },
          ]}
        />
        <AskCard
          num="02"
          title="인력 · 자원"
          options={[
            { label: "현재 + 신규", value: "10명", desc: "Phase 1 권장" },
            { label: "FSN 자산 활용", value: "All-access", desc: "부스터즈 · 카울리 · 동남아" },
            { label: "외부 채용 권한", value: "직접", desc: "Market Twin 명의" },
          ]}
        />
        <AskCard
          num="03"
          title="사업 구조"
          options={[
            { label: "★ Market Twin 유지", value: "현재 Market Twin", desc: "FSN 투자/license", highlight: true },
            { label: "FSN 자회사 신설", value: "Mr. AI 자회사", desc: "100% 지분" },
            { label: "부스터즈 산하", value: "통합", desc: "운영 simplicity" },
          ]}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
        <div className="mrai-card" style={{ background: "rgba(245,158,11,0.10)", borderColor: "var(--mrai-accent)", padding: "14px 18px" }}>
          <div className="mrai-card__label" style={{ color: "var(--mrai-accent)" }}>즉시 다음 action (2주 안)</div>
          <ul style={{ paddingLeft: 18, margin: "6px 0 0", fontSize: 12, lineHeight: 1.6, color: "var(--mrai-ink-on-dark)" }}>
            <li>1. <strong>FSN 대표 1:1 미팅</strong> (deck 시연 + 부스터즈 르무통 use case 합의)</li>
            <li>2. <strong>부스터즈 르무통 실무팀 wakeup</strong> (Brand Voice Guide + 매출 데이터 access)</li>
            <li>3. <strong>1단계 commitment 결정</strong> (₩2/10/30억 中 선택)</li>
          </ul>
        </div>
        <div className="mrai-card" style={{ background: "rgba(34,211,238,0.08)", borderColor: "var(--mrai-cool)", padding: "14px 18px" }}>
          <div className="mrai-card__label" style={{ color: "var(--mrai-cool)" }}>Why 지금</div>
          <ul style={{ paddingLeft: 16, margin: "6px 0 0", fontSize: 11, lineHeight: 1.55, color: "var(--mrai-ink-on-dark)" }}>
            <li>DOJO AI · Daydream funding rush 12개월 안에 한국 진입 가능</li>
            <li>FSN 신임 대표 임기 imprint 황금기 (한 번뿐)</li>
            <li>Market Twin 6개월 R&D — 다른 곳에 흘러가면 sunk cost</li>
            <li>FSN AI Driven 메시지의 첫 유형 product 부재</li>
          </ul>
        </div>
      </div>

      <div style={{ marginTop: "auto", paddingTop: 14, borderTop: "1px solid var(--mrai-rule-dark)", marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--mrai-ink-muted-dark)", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 4 }}>제 안 자</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--mrai-ink-on-dark)" }}>Market Twin</div>
            <div style={{ fontSize: 12, color: "var(--mrai-ink-muted-dark)", marginTop: 2 }}>markettwin.ai 기반 확장 · Mr. AI flagship</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--mrai-ink-muted-dark)", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 4 }}>다 음 미 팅</div>
            <div style={{ fontSize: 17, fontWeight: 600, color: "var(--mrai-accent)" }}>FSN 대표 1:1 · 2주 내</div>
            <div style={{ fontSize: 12, color: "var(--mrai-ink-muted-dark)", marginTop: 2 }}>FSN AI PIVOT · 2026-05</div>
          </div>
        </div>
      </div>
    </Slide>
  );
}

function AskCard({ num, title, options }: { num: string; title: string; options: Array<{ label: string; value: string; desc: string; highlight?: boolean }> }) {
  return (
    <div className="mrai-card" style={{ borderColor: "var(--mrai-rule-dark)", background: "rgba(241,245,249,0.04)", padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: "var(--mrai-accent)", lineHeight: 1 }}>{num}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--mrai-ink-on-dark)" }}>{title}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {options.map((o, i) => (
          <div key={i} style={{ padding: "7px 10px", background: o.highlight ? "rgba(245,158,11,0.18)" : "rgba(241,245,249,0.04)", border: o.highlight ? "1px solid var(--mrai-accent)" : "1px solid var(--mrai-rule-dark)", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--mrai-ink-muted-dark)", letterSpacing: 0.5 }}>{o.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: o.highlight ? "var(--mrai-accent)" : "var(--mrai-ink-on-dark)" }}>{o.value}</div>
            </div>
            <span style={{ fontSize: 10, color: "var(--mrai-ink-muted-dark)" }}>{o.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
