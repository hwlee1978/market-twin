import { Slide } from "../components/Slide";

/**
 * Slide 07 — Demo screenshots.
 * For deck v1 we render mockup "screen frames" with representative
 * content (real screenshots will replace these once prototype runs).
 * The point is to show that Mr. AI is real-shaped (not vapor) — three
 * concrete moments: Voice pick · content output · Market Twin verdict.
 */
export function DemoShowcase({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  return (
    <Slide variant="light" sectionLabel="B · WHAT IS Mr. AI" pageNumber={pageNumber} totalPages={totalPages}>
      <h2 className="mrai-slide__title">
        실제로 어떻게 보이는가
      </h2>
      <div className="mrai-slide__rule" />
      <p className="mrai-slide__subtitle" style={{ marginBottom: 28 }}>
        3개의 핵심 순간 — Voice 선택, 콘텐츠 생성 (founder 톤), Market Twin 전략 의사결정.
        화면은 mockup. 6주 안에 작동하는 prototype으로 교체 예정.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18 }}>
        <ScreenFrame
          step="01"
          title="Voice 선택"
          body={
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
              <div style={{ marginBottom: 10, color: "var(--mrai-ink-muted-light)" }}>오늘 어떤 voice로 일할까요?</div>
              <VoiceOption label="B2B Executive KR" selected />
              <VoiceOption label="Tech Founder EN" />
              <VoiceOption label="Marketing Pro" />
              <VoiceOption label="Korean Corporate" />
              <VoiceOption label="Casual Operator" />
              <div style={{ marginTop: 12, padding: "8px 10px", background: "rgba(34,211,238,0.08)", borderRadius: 6, fontSize: 11, color: "var(--mrai-ink-muted-light)" }}>
                <strong style={{ color: "var(--mrai-cool)" }}>+ Brand Guide 추가</strong> — 링티.pdf 첨부
              </div>
            </div>
          }
        />
        <ScreenFrame
          step="02"
          title="콘텐츠 생성 (founder 톤)"
          body={
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
              <div style={{ marginBottom: 6, color: "var(--mrai-ink-muted-light)" }}>LinkedIn post · 링티 글로벌 진출 검토</div>
              <div style={{ padding: 12, background: "white", border: "1px solid var(--mrai-rule-light)", borderRadius: 8, fontSize: 11, lineHeight: 1.5, color: "var(--mrai-ink-on-light)" }}>
                <strong>링티 글로벌 1순위 검토 — Market Twin 분석</strong>
                <br /><br />
                Deep tier 2번 시뮬 결과 매우 흥미롭습니다. US와 SG가 4-5pt 안에서 cluster를 이룸 — 단독 winner를 강제할 게 아닌 상황.
                <br /><br />
                · Run A: US 1순위 (mean 64.8 vs SG 63.7, gap 1.1)
                <br />
                · Run B: SG 1순위 (mean 62.4 vs VN 61.9, gap 0.4)
                <br />
                · 결론: 6개국 cluster — 내부 capability 기준 결정 필요
                <br /><br />
                <span style={{ color: "var(--mrai-cool)" }}>Mr. AI Top-2 dominance check 적용</span>으로 borderline 자동 인식.
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: "var(--mrai-ink-muted-light)" }}>
                Voice consistency: <strong style={{ color: "var(--mrai-accent)" }}>98%</strong> · Editorial pass
              </div>
            </div>
          }
        />
        <ScreenFrame
          step="03"
          title="Market Twin 전략 답 (링티 실데이터)"
          body={
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
              <div style={{ marginBottom: 6, color: "var(--mrai-ink-muted-light)" }}>"링티 어느 시장 1순위?"</div>
              <div style={{ padding: 12, background: "var(--mrai-bg-dark)", color: "var(--mrai-ink-on-dark)", borderRadius: 8, fontSize: 11, lineHeight: 1.5 }}>
                <div style={{ marginBottom: 8, fontSize: 12, color: "var(--mrai-accent)", fontWeight: 700 }}>🥇 US · 🥈 SG  동등 후보</div>
                <div style={{ marginBottom: 4 }}>mean: US 64.8 · SG 63.7 · <span style={{ color: "var(--mrai-ink-muted-dark)" }}>gap 1.1pt</span></div>
                <div style={{ marginBottom: 4 }}>합의도 28% (US) · MODERATE</div>
                <div style={{ color: "var(--mrai-ink-muted-dark)" }}>Dominance check 0/3 → top2 cluster</div>
                <hr style={{ margin: "10px 0", border: 0, borderTop: "1px solid var(--mrai-rule-dark)" }} />
                <div style={{ fontSize: 10, color: "var(--mrai-ink-muted-dark)" }}>
                  Top 6 cluster: US · SG · AU · VN · TH · JP (5pt 안)
                  <br />
                  "단독 winner 단정 불가 — 내부 capability로 결정"
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: "var(--mrai-ink-muted-light)" }}>
                실측 ensemble 1b0a9b52 · 2026-05-19 · 5,000 personas
              </div>
            </div>
          }
        />
      </div>

      <div style={{ marginTop: "auto", paddingTop: 24, padding: "16px 24px", background: "rgba(10,14,26,0.04)", borderRadius: 10, fontSize: 13, lineHeight: 1.55 }}>
        <span style={{ color: "var(--mrai-accent)", fontWeight: 700, marginRight: 12 }}>핵심 흐름</span>
        Voice 선택 → 모듈 호출 → 결과가 founder 톤으로 → 모든 action에 attribution tag → 며칠 후 "이 글이 ₩X 매출 만듦" closed-loop report.
      </div>
    </Slide>
  );
}

function ScreenFrame({ step, title, body }: { step: string; title: string; body: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", color: "var(--mrai-accent)" }}>STEP {step}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--mrai-ink-on-light)" }}>{title}</span>
      </div>
      <div style={{
        border: "1px solid var(--mrai-rule-light)",
        borderRadius: 10,
        background: "var(--mrai-card-light)",
        padding: 14,
        flex: 1,
        minHeight: 320,
      }}>
        {body}
      </div>
    </div>
  );
}

function VoiceOption({ label, selected }: { label: string; selected?: boolean }) {
  return (
    <div style={{
      padding: "6px 10px",
      marginBottom: 4,
      borderRadius: 6,
      background: selected ? "rgba(245,158,11,0.10)" : "white",
      border: selected ? "1px solid var(--mrai-accent)" : "1px solid var(--mrai-rule-light)",
      fontSize: 11,
      fontWeight: selected ? 600 : 400,
      color: selected ? "var(--mrai-ink-on-light)" : "var(--mrai-ink-muted-light)",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    }}>
      <span>{label}</span>
      {selected && <span style={{ color: "var(--mrai-accent)" }}>✓</span>}
    </div>
  );
}
