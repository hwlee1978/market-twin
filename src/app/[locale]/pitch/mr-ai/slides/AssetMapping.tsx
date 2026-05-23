import { Slide } from "../components/Slide";

/**
 * Slide 08 — FSN Asset Mapping.
 * 9-row table: each FSN asset → how it fuels Mr. AI → expected ROI.
 * This is "why FSN specifically can pull this off, not generic startup".
 */
export function AssetMapping({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  const rows = [
    { asset: "Market Twin (6개월 R&D)", fuel: "Strategic Decision module 이미 작동", roi: "즉시 운영 가능 · 1년 head start", highlight: true },
    { asset: "정부 OpenData 27 seed 적용", fuel: "AI Strategist의 ground truth (24개국)", roi: "경쟁사 0년 vs 우리 1년", highlight: true },
    { asset: "부스터즈 K-브랜드 4개+ (르무통·링티·디닥넥)", fuel: "First paying customer (internal)", roi: "₩30억+ 매출 추가 가능" },
    { asset: "카울리 모바일 광고 플랫폼", fuel: "Marketing Module 광고 집행 백엔드", roi: "DOJO · Daydream · Klaviyo 못 따라옴" },
    { asset: "동남아 자회사 5개국 (TH·VN·SG·TW·CN)", fuel: "글로벌 진출 native 인프라", roi: "링티 시뮬 데이터 보유 → 즉시 활용 가능" },
    { asset: "하이퍼코퍼레이션 테크 인력 (770억 투자 유치)", fuel: "Mr. AI 개발 인력 즉시 확보", roi: "4명 → 20명 6주 안에" },
    { asset: "FSN 광고주 base (수백 곳)", fuel: "외부 customer pipeline", roi: "글로벌 startup 초기 MOU 평균 5건 vs 우리 50건+" },
    { asset: "FSN 마케팅 전문가", fuel: "Voice Library 큐레이션 풀", roi: "AI 회사가 못 가진 자산" },
    { asset: "KOSDAQ 상장사 신뢰도", fuel: "Enterprise sale signal", roi: "스타트업 아닌 상장사 신사업" },
  ];
  return (
    <Slide variant="light" sectionLabel="C · WHY FSN ONLY" pageNumber={pageNumber} totalPages={totalPages}>
      <h2 className="mrai-slide__title">
        FSN <span className="mrai-emph">9개 자산</span>이 동시에 작용하는 곳은 Mr. AI 외 없음
      </h2>
      <div className="mrai-slide__rule" />
      <p className="mrai-slide__subtitle" style={{ marginBottom: 20 }}>
        외부 startup이 이 9개를 다 모으려면 5-7년. FSN은 이미 보유. 위 2개 (Market Twin engine · 정부 데이터)는 Market Twin 팀 6개월 R&D 결과로 추가됨.
      </p>

      <table className="mrai-table">
        <thead>
          <tr>
            <th style={{ width: "32%" }}>FSN 자산</th>
            <th style={{ width: "34%" }}>Mr. AI fuel</th>
            <th style={{ width: "34%" }}>예상 ROI (투자 수익률) · 효과</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.highlight ? "mrai-emphasized" : undefined}>
              <td style={{ fontWeight: 600 }}>
                {r.highlight && <span style={{ color: "var(--mrai-accent)", marginRight: 6 }}>★</span>}
                {r.asset}
              </td>
              <td>{r.fuel}</td>
              <td style={{ color: r.highlight ? "var(--mrai-accent)" : "var(--mrai-ink-on-light)", fontWeight: r.highlight ? 600 : 400 }}>{r.roi}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 20, padding: "14px 22px", background: "var(--mrai-bg-dark)", color: "var(--mrai-ink-on-dark)", borderRadius: 10, fontSize: 14, lineHeight: 1.55 }}>
        <span style={{ color: "var(--mrai-accent)", fontWeight: 700, marginRight: 12 }}>결론</span>
        Mr. AI를 외부 startup이 만들면 → 4명 팀이 6년 걸려도 못 따라옴.
        FSN이 만들면 → <span className="mrai-emph">6개월 안에 시장 leader</span> 가능.
      </div>
    </Slide>
  );
}
