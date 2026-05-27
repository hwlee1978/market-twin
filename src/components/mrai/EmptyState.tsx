import type { LucideIcon } from "lucide-react";

/**
 * Friendly empty state for Mr.AI panels that have nothing to show yet.
 *
 * The default "no rows returned" look (blank space or a thin "No data"
 * line) makes the UI feel broken to first-time users. This component
 * gives every empty-data state a consistent shape: tinted icon ball,
 * one-line title, one-line description, optional CTA. Pick the tone
 * that matches the parent panel's accent so the visual rhythm holds.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "slate",
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  tone?: "violet" | "emerald" | "amber" | "sky" | "rose" | "slate";
  compact?: boolean;
}) {
  const toneClass: Record<NonNullable<typeof tone>, string> = {
    violet: "bg-violet-50 text-violet-500",
    emerald: "bg-emerald-50 text-emerald-500",
    amber: "bg-amber-50 text-amber-500",
    sky: "bg-sky-50 text-sky-500",
    rose: "bg-rose-50 text-rose-500",
    slate: "bg-slate-100 text-slate-500",
  };

  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "py-6" : "py-10"
      }`}
    >
      <div
        className={`w-12 h-12 rounded-2xl flex items-center justify-center ${toneClass[tone]}`}
      >
        <Icon className="w-6 h-6" strokeWidth={1.8} />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-slate-900">{title}</h3>
      {description && (
        <p className="mt-1 text-xs text-slate-500 max-w-xs leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
