/**
 * Tiny shimmering placeholder. Used while waiting on an async fetch.
 *
 * Defaults are sized for inline text (h-3, full width). Override w/h
 * via the `className` prop. Composes with Tailwind `space-y-*` parents
 * for stacked rows.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-slate-200/70 ${className || "h-3 w-full"}`}
    />
  );
}

/** Card-shaped skeleton — matches the KPI card footprint. */
export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl border border-slate-200 bg-white p-4 ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-slate-200/70" />
        <div className="flex-1 space-y-2">
          <div className="h-2.5 w-16 rounded-md bg-slate-200/70" />
          <div className="h-6 w-12 rounded-md bg-slate-200/70" />
          <div className="h-2 w-20 rounded-md bg-slate-200/70" />
        </div>
      </div>
    </div>
  );
}

/** Four-up grid of card skeletons — drop-in for the KPI strip. */
export function SkeletonKPIStrip() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
