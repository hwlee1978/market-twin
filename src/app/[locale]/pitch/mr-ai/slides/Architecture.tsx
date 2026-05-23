import { Slide } from "../components/Slide";

/**
 * Slide 06 — Mr. AI Architecture.
 * Stack diagram: top-level Orchestrator (CEO Mr. AI) → 5 modules with
 * Decision Support specifically containing the Market Twin engine.
 * Voice Layer wraps every output. Attribution Engine closes the loop.
 */
export function Architecture({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  return (
    <Slide variant="light" sectionLabel="B · WHAT IS Mr. AI" pageNumber={pageNumber} totalPages={totalPages}>
      <h2 className="mrai-slide__title">
        Architecture — <span className="mrai-emph">5 모듈 + 3 layer</span>
      </h2>
      <div className="mrai-slide__rule" />

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14, marginTop: 8 }}>
        {/* Orchestrator top */}
        <div style={{ background: "var(--mrai-bg-dark)", color: "var(--mrai-ink-on-dark)", borderRadius: 12, padding: "16px 22px", display: "flex", alignItems: "center", gap: 20 }}>
          <span style={{ background: "var(--mrai-accent)", color: "var(--mrai-bg-dark)", padding: "3px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: "0.15em" }}>L1</span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>CEO Mr. AI · Orchestrator</div>
            <div style={{ fontSize: 13, color: "var(--mrai-ink-muted-dark)", marginTop: 2 }}>
              사용자 instruction → 어떤 모듈로 라우팅할지 결정 + plan 합성 + 결과 통합 narrative
            </div>
          </div>
        </div>

        {/* 5 Modules row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 10 }}>
          <ModuleBox name="Marketing" desc="콘텐츠 · SEO · 다채널 발행" sub="Multi-channel 자동 발행 + Voice DNA" />
          <ModuleBox name="Sales" desc="Cold outreach · 답장 · follow-up" sub="HubSpot pipeline 자동 업데이트" />
          <ModuleBox name="IR" desc="투자자 update · KPI dashboard" sub="미팅 brief · 보고서 자동" />
          <ModuleBox name="Decision Support" desc="시장 · 가격 · 채널 전략 답" sub="🔄 Market Twin engine" highlight />
          <ModuleBox name="Daily Briefing" desc="아침 5분 brief · 액션 plan" sub="이메일 triage + KPI 변화" />
        </div>

        {/* Voice Layer */}
        <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid var(--mrai-accent)", borderRadius: 12, padding: "14px 22px", display: "flex", alignItems: "center", gap: 20 }}>
          <span style={{ background: "var(--mrai-accent)", color: "var(--mrai-bg-dark)", padding: "3px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: "0.15em" }}>VOICE</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--mrai-ink-on-light)" }}>Voice DNA Layer · 모든 모듈 출력의 final transform</div>
            <div style={{ fontSize: 12, color: "var(--mrai-ink-muted-light)", marginTop: 2 }}>
              Pre-built voice library 5+ profile · Brand Voice Guide 파싱 · Editorial agent 일관성 검증 · Customer-trained DNA (Phase 2)
            </div>
          </div>
        </div>

        {/* Persistent Memory */}
        <div style={{ background: "rgba(34,211,238,0.08)", border: "1px solid var(--mrai-cool)", borderRadius: 12, padding: "14px 22px", display: "flex", alignItems: "center", gap: 20 }}>
          <span style={{ background: "var(--mrai-cool)", color: "var(--mrai-bg-dark)", padding: "3px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: "0.15em" }}>MEMORY</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--mrai-ink-on-light)" }}>Persistent Memory · cross-venture · cross-workspace</div>
            <div style={{ fontSize: 12, color: "var(--mrai-ink-muted-light)", marginTop: 2 }}>
              사용자 profile · 회사별 context graph · 의사결정 log · Voice DNA snapshot — 평생 누적 학습
            </div>
          </div>
        </div>

        {/* Attribution Engine */}
        <div style={{ background: "var(--mrai-bg-dark)", color: "var(--mrai-ink-on-dark)", borderRadius: 12, padding: "14px 22px", display: "flex", alignItems: "center", gap: 20 }}>
          <span style={{ background: "var(--mrai-cool)", color: "var(--mrai-bg-dark)", padding: "3px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: "0.15em" }}>ATTR</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Attribution Engine · 모든 action에 tracking ID</div>
            <div style={{ fontSize: 12, color: "var(--mrai-ink-muted-dark)", marginTop: 2 }}>
              HubSpot (CRM) · LinkedIn · X · GA4 (웹 분석) 통합 → "Mr. AI가 한 일 → ₩X 매출" closed-loop
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, fontSize: 12, color: "var(--mrai-ink-muted-light)", lineHeight: 1.5 }}>
        <span className="mrai-emph">기술 stack:</span> Next.js · Supabase · Multi-LLM (Anthropic Sonnet · OpenAI GPT-5.4 · Gemini 2.5 Pro · xAI Grok · DeepSeek) ·
        Anthropic prompt caching (-31% cost) · Cloud Run worker · TypeScript strict — Market Twin 인프라 그대로 확장.
      </div>
    </Slide>
  );
}

function ModuleBox({ name, desc, sub, highlight }: { name: string; desc: string; sub: string; highlight?: boolean }) {
  return (
    <div
      style={{
        background: highlight ? "rgba(245,158,11,0.06)" : "var(--mrai-card-light)",
        border: highlight ? "1.5px solid var(--mrai-accent)" : "1px solid var(--mrai-rule-light)",
        borderRadius: 10,
        padding: "14px 14px",
        minHeight: 120,
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--mrai-ink-on-light)", marginBottom: 4 }}>{name}</div>
      <div style={{ fontSize: 12, color: "var(--mrai-ink-muted-light)", lineHeight: 1.45, marginBottom: 8 }}>{desc}</div>
      <div style={{ fontSize: 11, color: highlight ? "var(--mrai-accent)" : "var(--mrai-ink-muted-light)", fontWeight: highlight ? 600 : 400, lineHeight: 1.4 }}>{sub}</div>
    </div>
  );
}
