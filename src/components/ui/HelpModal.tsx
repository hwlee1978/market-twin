"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HelpCircle, X } from "lucide-react";
import { clsx } from "clsx";

/**
 * Clickable help icon (?) that opens a modal panel with substantial
 * explanatory content. Use this when an inline tooltip is not enough —
 * e.g. multi-section explanations, decision flows, or interpretation
 * guides for a complex chart.
 *
 * The HelpTooltip companion in this folder covers the lighter case
 * (single-sentence column header explanation); this modal covers the
 * "explain how to read this entire section" case.
 *
 * Behavior:
 *   - Click the ? icon → modal opens with backdrop
 *   - Click backdrop OR press Escape → modal closes
 *   - Renders into body via portal so parent overflow can't clip it
 *   - SSR-safe (returns null until mounted on client)
 */
export function HelpModal({
  title,
  children,
  className,
}: {
  /** Modal heading. Should be the same as / similar to the section
   *  whose interpretation is being explained, so the user sees the
   *  match between trigger location and modal content. */
  title: string;
  /** Modal body — typically a series of <h3>, <p>, <ul>, etc. */
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true); // SSR-safe mount flag
  }, []);

  // Esc to close + body scroll lock while modal is open. Restore
  // overflow on cleanup so navigating away doesn't leave the page
  // permanently scroll-locked.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <span className={clsx("relative inline-flex items-center align-middle", className)}>
      <button
        type="button"
        aria-label={title}
        onClick={() => setOpen(true)}
        className="text-slate-400 hover:text-brand focus:text-brand focus:outline-none cursor-pointer leading-none p-1 rounded-full hover:bg-slate-100"
      >
        <HelpCircle size={16} />
      </button>
      {open && mounted
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={title}
              className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
              onClick={(e) => {
                // Close only when clicking the backdrop, not when the
                // click bubbled from the panel itself.
                if (e.target === e.currentTarget) setOpen(false);
              }}
            >
              <div
                ref={panelRef}
                className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
              >
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
                  <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={() => setOpen(false)}
                    className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md p-1 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="px-6 py-5 overflow-y-auto text-sm text-slate-700 leading-relaxed space-y-4">
                  {children}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
