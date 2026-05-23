import { Slide } from "../components/Slide";

/**
 * Slide 19 — THE ASK (현실 · AI를 활용한 개발).
 * AI-augmented small team variant of TheAsk: lower capital floor,
 * smaller headcount. Drops 사업 구조 row — only 자본 + 인력.
 */
export function TheAskReality({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  return (
    <Slide variant="dark" sectionLabel="E · THE ASK" pageNumber={pageNumber} totalPages={totalPages}>
      <span className="mrai-cover__tagline" style={{ marginTop: 0 }}>FINAL DECISION</span>
      <h2 style={{ fontSize: 56, lineHeight: 1.0, letterSpacing: "-0.035em", fontWeight: 800, marginTop: 18, marginBottom: 10 }}>
        Ask{" "}
        <span style={{ fontSize: 26, fontWeight: 600, color: "var(--mrai-ink-muted-dark)", letterSpacing: "-0.01em" }}>
          (현실 — AI를 활용한 개발)
        </span>
      </h2>
      <p style={{ fontSize: 16, lineHeight: 1.5, color: "var(--mrai-ink-muted-dark)", marginBottom: 30, maxWidth: "85%" }}>
        3가지 결정 사항. 모두 회수 가능한 reversible 결정. 첫 단계는 ★ 1단계 pivot ₩2억 권장.
      </p>

      <AskSectionRow
        label="자본 commitment"
        cards={[
          { label: "PoC", value: "₩50M", desc: "검증용" },
          { label: "★ 1단계", value: "₩2억", desc: "권장", highlight: true },
          { label: "본격 pivot", value: "₩???", desc: "공격" },
        ]}
      />

      <div style={{ height: 22 }} />

      <AskSectionRow
        label="인력 · 자원"
        cards={[
          { label: "현재 + 신규", value: "3명", desc: "Phase 1 권장" },
          { label: "FSN 자산 활용", value: "All-access", desc: "부스터즈 · 카울리 · 동남아" },
          { label: "외부 채용 권한", value: "직접", desc: "Market Twin 명의" },
        ]}
      />
    </Slide>
  );
}

function AskSectionRow({
  label,
  cards,
}: {
  label: string;
  cards: Array<{ label: string; value: string; desc: string; highlight?: boolean }>;
}) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.18em", color: "var(--mrai-accent)", marginBottom: 10, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        {cards.map((c, i) => (
          <div
            key={i}
            style={{
              padding: "18px 22px",
              background: c.highlight ? "rgba(245,158,11,0.18)" : "rgba(241,245,249,0.04)",
              border: c.highlight ? "1px solid var(--mrai-accent)" : "1px solid var(--mrai-rule-dark)",
              borderRadius: 8,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: c.highlight ? "var(--mrai-accent)" : "var(--mrai-ink-muted-dark)",
                letterSpacing: 0.6,
                marginBottom: 8,
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              {c.label}
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: c.highlight ? "var(--mrai-accent)" : "var(--mrai-ink-on-dark)",
                marginBottom: 6,
                lineHeight: 1.1,
              }}
            >
              {c.value}
            </div>
            <div style={{ fontSize: 12, color: "var(--mrai-ink-muted-dark)", fontStyle: "italic" }}>
              {c.desc}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
