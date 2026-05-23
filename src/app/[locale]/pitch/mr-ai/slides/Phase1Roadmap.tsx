import { Slide } from "../components/Slide";

/**
 * Slide 16 — Phase 1 Roadmap · 6 months to internal proof.
 * Concrete milestones week-by-week. The deliverable at the end of
 * Month 3 is "Le Mouton Japan decision aided by Mr. AI" — verifiable
 * outcome the CEO can point to.
 */
export function Phase1Roadmap({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  return (
    <Slide variant="light" sectionLabel="E · ROADMAP" pageNumber={pageNumber} totalPages={totalPages}>
      <h2 className="mrai-slide__title">
        Phase 1 — <span className="mrai-emph">6개월 내 internal proof</span>
      </h2>
      <div className="mrai-slide__rule" />
      <p className="mrai-slide__subtitle" style={{ marginBottom: 24 }}>
        Month 1-3: Mr. AI 코어 + Market Twin 통합. Month 4-6: 부스터즈 첫 internal customer (르무통 일본 진출 의사결정).
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <PhaseColumn
          label="Month 1-3 · Foundation"
          milestones={[
            { week: "W1-2", text: "Repo rebrand (Market Twin → Mr. AI) · Master Orchestrator · Voice Library 5 profile" },
            { week: "W3-4", text: "HubSpot · LinkedIn integration · Persistent Memory layer" },
            { week: "W5-6", text: "Sales Module + 첫 closed-loop attribution (LinkedIn DM → HubSpot deal)" },
            { week: "W7-8", text: "GA4 (웹 분석) · X integration · Marketing Module v1 · Attribution Engine v1" },
            { week: "W9-10", text: "Decision Support — Market Twin engine 통합 + 의사결정 답 5종 작동" },
            { week: "W11-12", text: "Daily Briefing · IR Module v1 · 첫 내부 베타테스트 (본인 + FSN 임원 2명)" },
          ]}
          deliverable="✓ 작동하는 Mr. AI MVP — 5개 module · 4 integration · Voice Layer · Market Twin engine"
        />
        <PhaseColumn
          label="Month 4-6 · Self-Customer Proof"
          milestones={[
            { week: "W13-14", text: "부스터즈 brand voice 학습 — 링티 (실데이터 확장) + 르무통 voice guide 첨부" },
            { week: "W15-16", text: "르무통 일본 진출 의사결정 Market Twin 시뮬 추가 실행 + 결과 리포트 1차" },
            { week: "W17-18", text: "Mr. AI 적용 캠페인 시작 (링티/르무통 LinkedIn·X) + attribution 추적" },
            { week: "W19-20", text: "디닥넥 등 나머지 brand 확장 (multi-brand workspace 검증)" },
            { week: "W21-22", text: "Mr. AI 외부 sales-ready 상태 — FSN 광고주 2-3곳 pilot demo" },
            { week: "W23-24", text: "Phase 1 마무리: ROI report 작성 (Mr. AI가 만든 매출 ₩X 측정) · Series A LOI 협의" },
          ]}
          deliverable="✓ 링티 (확인됨) + 르무통 case study + 첫 FSN 광고주 pilot · ARR ₩2-5억 baseline"
          accent
        />
      </div>

      <div style={{ marginTop: 22, padding: "14px 22px", background: "var(--mrai-bg-dark)", color: "var(--mrai-ink-on-dark)", borderRadius: 10, fontSize: 14, lineHeight: 1.55 }}>
        <span style={{ color: "var(--mrai-accent)", fontWeight: 700, marginRight: 12 }}>6개월 종료 시 확보 자산</span>
        ① 작동하는 product · ② 르무통 case study · ③ 부스터즈 internal 사용 검증 · ④ 2-3 외부 pilot · ⑤ Phase 2 자본 확보 근거
      </div>
    </Slide>
  );
}

function PhaseColumn({ label, milestones, deliverable, accent }: { label: string; milestones: Array<{ week: string; text: string }>; deliverable: string; accent?: boolean }) {
  return (
    <div className="mrai-card" style={{ background: accent ? "rgba(245,158,11,0.06)" : "var(--mrai-card-light)", borderColor: accent ? "var(--mrai-accent)" : "var(--mrai-rule-light)", padding: 20 }}>
      <div className="mrai-card__label" style={{ color: "var(--mrai-accent)" }}>{label}</div>
      <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
        {milestones.map((m, i) => (
          <li key={i} style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: 12, padding: "8px 0", borderBottom: i < milestones.length - 1 ? "1px solid var(--mrai-rule-light)" : "none", fontSize: 13, lineHeight: 1.5 }}>
            <strong style={{ color: "var(--mrai-accent)", fontVariantNumeric: "tabular-nums" }}>{m.week}</strong>
            <span>{m.text}</span>
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 14, padding: "10px 14px", background: accent ? "rgba(245,158,11,0.12)" : "var(--mrai-bg-dark)", color: accent ? "var(--mrai-ink-on-light)" : "var(--mrai-ink-on-dark)", borderRadius: 8, fontSize: 12, fontWeight: 600, lineHeight: 1.5 }}>
        {deliverable}
      </div>
    </div>
  );
}
