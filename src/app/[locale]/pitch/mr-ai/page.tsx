import "./styles.css";
import { Cover } from "./slides/Cover";
import { MarketTiming } from "./slides/MarketTiming";
import { FSNDirection } from "./slides/FSNDirection";
import { OneLineDef } from "./slides/OneLineDef";
import { FourDifferentiators } from "./slides/FourDifferentiators";
import { Architecture } from "./slides/Architecture";
import { DemoShowcase } from "./slides/DemoShowcase";
import { AssetMapping } from "./slides/AssetMapping";
import { MarketTwinShowcase } from "./slides/MarketTwinShowcase";
import { SelfCustomerCase } from "./slides/SelfCustomerCase";
import { ExternalPipeline } from "./slides/ExternalPipeline";
import { GlobalPath } from "./slides/GlobalPath";
import { MarketAndComparables } from "./slides/MarketAndComparables";
import { UnitEconomics } from "./slides/UnitEconomics";
import { ROITable } from "./slides/ROITable";
import { Phase1Roadmap } from "./slides/Phase1Roadmap";
import { Phase23Roadmap } from "./slides/Phase23Roadmap";
import { TheAsk } from "./slides/TheAsk";
import { TheAskReality } from "./slides/TheAskReality";

/**
 * Mr. AI Pitch Deck · 19 slides · FSN AI Pivot Proposal.
 *
 * Each slide is a fixed 1456×819 (16:9) React component. Print CSS in
 * styles.css splits them across PDF pages with `page-break-after: always`.
 *
 * To export PDF: Chrome → Print (Cmd/Ctrl+P) → Destination: Save as PDF
 *  → Layout: Landscape → Margins: None → Background graphics: ON.
 * Result: 1 PDF page per slide, design preserved at print resolution.
 */
export default function MrAIPitchPage() {
  const total = 19;
  return (
    <main className="mrai-deck mrai-deck-screen">
      <div className="mrai-print-hide" style={{ maxWidth: 1456, margin: "0 auto 18px", padding: "18px 24px", background: "rgba(255,255,255,0.06)", borderRadius: 12, color: "#cbd5e1", fontSize: 13, lineHeight: 1.6 }}>
        <strong style={{ color: "#f59e0b" }}>PDF로 저장:</strong> Chrome → Print (Ctrl/Cmd+P) → Destination: <strong>Save as PDF</strong> · Layout: <strong>Landscape</strong> · Margins: <strong>None</strong> · Background graphics: <strong>ON</strong>. 19 슬라이드 = 19 페이지로 분리됩니다.
      </div>

      <Cover totalPages={total} />
      <MarketTiming pageNumber={2} totalPages={total} />
      <FSNDirection pageNumber={3} totalPages={total} />
      <OneLineDef pageNumber={4} totalPages={total} />
      <FourDifferentiators pageNumber={5} totalPages={total} />
      <Architecture pageNumber={6} totalPages={total} />
      <DemoShowcase pageNumber={7} totalPages={total} />
      <AssetMapping pageNumber={8} totalPages={total} />
      <MarketTwinShowcase pageNumber={9} totalPages={total} />
      <SelfCustomerCase pageNumber={10} totalPages={total} />
      <ExternalPipeline pageNumber={11} totalPages={total} />
      <GlobalPath pageNumber={12} totalPages={total} />
      <MarketAndComparables pageNumber={13} totalPages={total} />
      <UnitEconomics pageNumber={14} totalPages={total} />
      <ROITable pageNumber={15} totalPages={total} />
      <Phase1Roadmap pageNumber={16} totalPages={total} />
      <Phase23Roadmap pageNumber={17} totalPages={total} />
      <TheAsk pageNumber={18} totalPages={total} />
      <TheAskReality pageNumber={19} totalPages={total} />
    </main>
  );
}

export const metadata = {
  title: "Mr. AI · FSN AI Pivot Proposal",
  description: "Mr. AI — Executive-grade AI CEO OS. FSN의 AI Driven 전략 execution vehicle.",
};
