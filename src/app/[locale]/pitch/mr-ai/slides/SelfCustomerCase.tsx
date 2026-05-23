import { Slide } from "../components/Slide";

/**
 * Slide 10 — Self-Customer Case · Lingtea 글로벌 진출 우선순위.
 *
 * 진짜 Market Twin Deep tier 2번 실행 결과 (2026-05-18, 2026-05-19)를
 * 그대로 case study로 사용. 두 runs가 다른 "winner"를 낸 borderline
 * 사례 → 새로 ship된 Top-2 dominance check가 이를 cluster로 자동
 * 인식 + 단독 winner 단정 회피. AI가 휘둘리지 않고 정직히 답하는
 * 차별점을 demo하는 가장 강력한 self-customer case.
 *
 * Source ensembles:
 *   - 1b0a9b52 (Run A, 2026-05-19): mean rank US 64.8 / SG 63.7 ...
 *   - cccf9c32 (Run B, 2026-05-18): mean rank SG 62.4 / VN 61.9 ...
 */
export function SelfCustomerCase({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  return (
    <Slide variant="light" sectionLabel="C · WHY FSN ONLY" pageNumber={pageNumber} totalPages={totalPages}>
      <h2 className="mrai-slide__title">
        Self-Customer Case — <span className="mrai-emph">링티 글로벌 진출 우선순위</span>
      </h2>
      <div className="mrai-slide__rule" />
      <p className="mrai-slide__subtitle" style={{ marginBottom: 20 }}>
        부스터즈 portfolio 링티. 실제 Market Twin Deep tier 2번 실행 데이터 + Mr. AI의 Top-2 dominance check가 발견한 borderline 신호.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div className="mrai-card" style={{ minHeight: 380 }}>
          <div className="mrai-card__label">실제 Deep tier 2번 · 5,000 페르소나 × 5 LLM</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 8, marginBottom: 10 }}>같은 제품, 다른 winner — 왜?</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ background: "var(--mrai-card-light)", padding: 10, borderRadius: 6, fontSize: 11, lineHeight: 1.55 }}>
              <div style={{ color: "var(--mrai-accent)", fontWeight: 700, fontSize: 10, letterSpacing: "0.15em" }}>RUN A · 05-19</div>
              <div style={{ marginTop: 4 }}>🥇 US · mean 64.8</div>
              <div>🥈 SG · 63.7 <span style={{ color: "var(--mrai-ink-muted-light)" }}>(gap 1.1)</span></div>
              <div>🥉 AU · 59.8 / VN 59.6 / TH 59.6 / JP 59.4</div>
              <div style={{ marginTop: 8, color: "var(--mrai-ink-muted-light)", fontSize: 10 }}>recommendation: US 68% MODERATE</div>
              <div style={{ color: "#991b1b", fontSize: 10 }}>vote distribution: SG=52%, US=28% ⚠ 불일치</div>
            </div>
            <div style={{ background: "var(--mrai-card-light)", padding: 10, borderRadius: 6, fontSize: 11, lineHeight: 1.55 }}>
              <div style={{ color: "var(--mrai-accent)", fontWeight: 700, fontSize: 10, letterSpacing: "0.15em" }}>RUN B · 05-18</div>
              <div style={{ marginTop: 4 }}>🥇 SG · mean 62.4</div>
              <div>🥈 VN · 61.9 <span style={{ color: "var(--mrai-ink-muted-light)" }}>(gap 0.4)</span></div>
              <div>🥉 US · 60.9 / TH 60.4 / JP 59.6</div>
              <div style={{ marginTop: 8, color: "var(--mrai-ink-muted-light)", fontSize: 10 }}>recommendation: SG 57% MODERATE</div>
              <div style={{ color: "#991b1b", fontSize: 10 }}>같은 제품, Run A와 다른 winner ⚠</div>
            </div>
          </div>
          <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, fontSize: 12, color: "#991b1b", lineHeight: 1.55 }}>
            <strong>문제:</strong> 단독 winner framing은 borderline 제품에서 매 run마다 다른 답을 낸다. CEO가 시뮬 결과를 못 믿게 됨.
          </div>
        </div>

        <div className="mrai-card" style={{ background: "rgba(245,158,11,0.06)", borderColor: "var(--mrai-accent)", minHeight: 380 }}>
          <div className="mrai-card__label">Mr. AI 의 정직한 답 (Top-2 dominance check)</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 8, marginBottom: 10 }}>Borderline cluster를 정직히 인정</h3>
          <div style={{ background: "var(--mrai-bg-dark)", color: "var(--mrai-ink-on-dark)", padding: 12, borderRadius: 8, fontSize: 11, lineHeight: 1.6, fontFamily: "ui-monospace, monospace" }}>
            <div style={{ color: "var(--mrai-accent)", marginBottom: 4 }}># Dominance check (2-of-3 pass to call single winner)</div>
            <div>meanGap ≥ 5pt &nbsp; ✗ (Run A 1.1, Run B 0.4)</div>
            <div>voteShare ≥ 50% &nbsp; ✗ (Run A 28%)</div>
            <div>cross-LLM agree &nbsp; ✗ (Anthropic SG, DeepSeek US 등 분산)</div>
            <div style={{ marginTop: 6, color: "var(--mrai-accent)" }}>passCount: 0 / 3</div>
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--mrai-rule-dark)" }}>
              <strong style={{ color: "var(--mrai-accent)" }}>displayMode = "top2"</strong>
            </div>
            <div style={{ marginTop: 4, color: "var(--mrai-ink-on-dark)" }}>"🥇 US · 🥈 SG 동등 후보"</div>
            <div style={{ color: "var(--mrai-ink-muted-dark)", fontSize: 10 }}>"이 제품은 5pt 안에 US/SG/VN/TH/JP/AU 6개국 cluster — 내부 capability로 결정"</div>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, lineHeight: 1.6 }}>
            <strong style={{ color: "var(--mrai-accent)" }}>의미:</strong> AI가 휘둘리지 않고 borderline을 정직히 알림.<br />
            CEO 신뢰 ↑ — "AI가 매번 다른 답하는 게 아니라, 이 제품은 진짜 borderline인 것"
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18, padding: "12px 22px", background: "var(--mrai-bg-dark)", color: "var(--mrai-ink-on-dark)", borderRadius: 10, fontSize: 13, lineHeight: 1.55 }}>
        <span style={{ color: "var(--mrai-accent)", fontWeight: 700, marginRight: 12 }}>Self-validation 결과</span>
        이 case 자체가 Market Twin 팀이 <span className="mrai-emph">실제로 발견하고 해결한 R&D 자산</span>.
        Top-2 dominance check는 2026-05 ship — 부스터즈 4개 브랜드 모두 이 layer 위에서 운영 가능.
      </div>
    </Slide>
  );
}
