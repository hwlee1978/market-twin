import type { ReactNode } from "react";

/**
 * Base slide wrapper. Fixed 1456×819 (16:9 landscape) dimensions to
 * guarantee 1 slide = 1 PDF page on Chrome print-to-PDF.
 *
 * Variants:
 *   "dark"  — cover, section dividers, dramatic emphasis
 *   "light" — content slides (default)
 *
 * Slide number + section label render automatically when sectionLabel
 * and pageNumber are passed. Footer always shows the deck identity.
 */
export function Slide({
  variant = "light",
  sectionLabel,
  pageNumber,
  totalPages,
  children,
}: {
  variant?: "dark" | "light";
  sectionLabel?: string;
  pageNumber?: number;
  totalPages?: number;
  children: ReactNode;
}) {
  const cls = variant === "dark" ? "mrai-slide mrai-slide--dark" : "mrai-slide mrai-slide--light";
  return (
    <section className={cls}>
      <div className="mrai-slide__inner">
        {(sectionLabel || pageNumber) && (
          <div className="mrai-slide__header">
            <span className="mrai-slide__section-label">{sectionLabel ?? ""}</span>
            <span className="mrai-slide__page-pos">
              {pageNumber !== undefined && totalPages !== undefined
                ? `${String(pageNumber).padStart(2, "0")} / ${String(totalPages).padStart(2, "0")}`
                : ""}
            </span>
          </div>
        )}
        {children}
        <div className="mrai-slide__footer">
          <span className="mrai-slide__brandmark">
            <span className="mrai-logo" aria-hidden />
            Mr. AI
          </span>
          <span>FSN AI PIVOT PROPOSAL · 2026-05</span>
        </div>
      </div>
    </section>
  );
}
