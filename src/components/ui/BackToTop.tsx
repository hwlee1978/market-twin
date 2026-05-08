"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

/**
 * Floating "back to top" button that fades in once the page has
 * scrolled past 600px. Cheap quality-of-life on long result pages —
 * the detailed dashboard tabs (e.g. country drilldown, persona voice
 * list) easily run 4-5 viewports tall and the user otherwise has to
 * scroll all the way back manually to switch tabs in the sticky
 * header.
 *
 * Self-contained: fixes itself in the bottom-right via `fixed` and
 * uses smooth scroll. Hidden by default below the threshold so it
 * doesn't clutter short pages (the wizard, plans, billing all stay
 * within one viewport).
 */
export function BackToTop({ threshold = 600 }: { threshold?: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      className="fixed bottom-6 right-6 z-40 bg-brand text-white rounded-full p-3 shadow-lg hover:bg-brand-700 transition-all hover:scale-105"
    >
      <ArrowUp size={18} />
    </button>
  );
}
