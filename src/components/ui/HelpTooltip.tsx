"use client";

import { HelpCircle } from "lucide-react";
import { clsx } from "clsx";

/**
 * Small (?) icon that reveals an explanatory tooltip on hover/focus.
 * Used to explain column headers, metrics, and labels in result pages
 * — "수요 점수가 뭐예요?" should be answered without leaving the table.
 *
 * Pure-CSS hover via group-hover, no portal, no JS state. Works on
 * touch devices via :focus-within when the icon is tab-focused; not
 * a perfect mobile experience but good enough for the desktop-first
 * B2B target.
 */
export function HelpTooltip({
  text,
  side = "top",
  className,
}: {
  text: string;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  const sidePos = {
    top: "bottom-full mb-2 left-1/2 -translate-x-1/2",
    bottom: "top-full mt-2 left-1/2 -translate-x-1/2",
    left: "right-full mr-2 top-1/2 -translate-y-1/2",
    right: "left-full ml-2 top-1/2 -translate-y-1/2",
  }[side];

  return (
    <span
      className={clsx(
        "group relative inline-flex items-center align-middle",
        className,
      )}
    >
      <button
        type="button"
        tabIndex={0}
        aria-label={text}
        className="text-slate-400 hover:text-slate-600 focus:text-slate-600 focus:outline-none cursor-help leading-none p-0.5"
      >
        <HelpCircle size={12} />
      </button>
      <span
        role="tooltip"
        className={clsx(
          "pointer-events-none absolute z-50 opacity-0 invisible",
          "group-hover:opacity-100 group-hover:visible",
          "group-focus-within:opacity-100 group-focus-within:visible",
          "transition-opacity duration-100",
          "rounded-md bg-slate-900 text-white text-xs leading-relaxed px-2.5 py-1.5",
          "w-max max-w-[240px] whitespace-normal text-left font-normal normal-case tracking-normal",
          "shadow-lg",
          sidePos,
        )}
      >
        {text}
      </span>
    </span>
  );
}
