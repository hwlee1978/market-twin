import type { LucideIcon } from "lucide-react";

/**
 * Standard page header used across the app shell. Replaces the bare
 * `<h1>...<button/>` pattern that previously forced every page to rebuild
 * its own spacing and resulted in text glued to the top-left corner.
 * Keeps the title / subtitle / actions trio aligned with consistent
 * vertical rhythm so navigating between pages doesn't shift the eye.
 *
 * Optional `icon` renders a soft tinted square next to the title — used
 * by the Mr.AI tabs so each section gets a quick visual anchor that
 * echoes the tab-bar icon above.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  icon: Icon,
  iconTone = "violet",
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  icon?: LucideIcon;
  iconTone?: "violet" | "emerald" | "amber" | "sky" | "rose" | "slate";
}) {
  const toneClass: Record<NonNullable<typeof iconTone>, string> = {
    violet: "bg-violet-50 text-violet-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    sky: "bg-sky-50 text-sky-600",
    rose: "bg-rose-50 text-rose-600",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <div className="flex items-start justify-between gap-4 pb-2">
      <div className="min-w-0 flex items-start gap-3">
        {Icon && (
          <div
            className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${toneClass[iconTone]}`}
          >
            <Icon className="w-5 h-5" strokeWidth={2.2} />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-sm text-slate-500 leading-relaxed max-w-2xl">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  );
}
