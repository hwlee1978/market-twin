"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HelpCircle } from "lucide-react";
import { clsx } from "clsx";

/**
 * Small (?) icon that reveals an explanatory tooltip on hover/focus.
 * Used to explain column headers, metrics, and labels in result pages.
 *
 * Uses createPortal to render the popover directly under <body>, so
 * ancestor `overflow: hidden` containers (like the result tables) don't
 * clip it. Position is computed from the trigger's bounding rect on
 * mount/scroll so the tooltip floats correctly relative to its anchor.
 */
export function HelpTooltip({
  text,
  side = "top",
  className,
}: {
  text: string;
  side?: "top" | "bottom";
  className?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(
    null,
  );

  // SSR-safe portal target — only set on the client after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Recompute coords whenever the popover opens, and again on scroll/resize
  // while it's open so it tracks with the page.
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      // Center horizontally on the trigger; place above (side=top) or below.
      const left = r.left + r.width / 2;
      const top = side === "top" ? r.top : r.bottom;
      setCoords({ left, top });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, side]);

  return (
    <span
      className={clsx("relative inline-flex items-center align-middle", className)}
    >
      <button
        ref={triggerRef}
        type="button"
        tabIndex={0}
        aria-label={text}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="text-slate-400 hover:text-slate-600 focus:text-slate-600 focus:outline-none cursor-help leading-none p-0.5"
      >
        <HelpCircle size={12} />
      </button>
      {open && mounted && coords
        ? createPortal(
            <span
              role="tooltip"
              className={clsx(
                "fixed z-[100] pointer-events-none",
                "rounded-md bg-slate-900 text-white text-xs leading-relaxed px-2.5 py-1.5",
                "w-max max-w-[260px] whitespace-normal text-left",
                "font-normal normal-case tracking-normal",
                "shadow-lg",
              )}
              style={{
                left: coords.left,
                top: coords.top,
                transform:
                  side === "top"
                    ? "translate(-50%, calc(-100% - 8px))"
                    : "translate(-50%, 8px)",
              }}
            >
              {text}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
