/**
 * Standard page header used across the app shell. Replaces the bare
 * `<h1>...<button/>` pattern that previously forced every page to rebuild
 * its own spacing and resulted in text glued to the top-left corner.
 * Keeps the title / subtitle / actions trio aligned with consistent
 * vertical rhythm so navigating between pages doesn't shift the eye.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 pb-2">
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
      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  );
}
