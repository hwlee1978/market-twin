import { clsx } from "clsx";

/**
 * Animated placeholder block — shown by loading.tsx files in each route
 * segment so navigation feels instant. Next.js automatically renders the
 * nearest loading.tsx as a Suspense fallback while the new page resolves
 * its server data, so the user sees this skeleton the moment they click
 * a link instead of staring at the previous page until the next one is
 * ready.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        "animate-pulse rounded-md bg-slate-200/70",
        className,
      )}
    />
  );
}

/** Convenience: a header block (title line + optional subtitle line). */
export function HeaderSkeleton({ withSubtitle = true }: { withSubtitle?: boolean }) {
  return (
    <div className="space-y-3 pb-2">
      <Skeleton className="h-7 w-56" />
      {withSubtitle && <Skeleton className="h-4 w-80" />}
    </div>
  );
}

/** A horizontal strip of KPI card skeletons. */
export function KpiRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card">
          <Skeleton className="h-3 w-20 mb-3" />
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </div>
  );
}

/** A table skeleton with a header row + n body rows. */
export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="card p-0 overflow-hidden">
      <div
        className="bg-slate-50 border-b border-slate-100 px-6 py-3 grid gap-4"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-16" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="border-t border-slate-100 px-6 py-4 grid gap-4"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className={clsx("h-4", c === 0 ? "w-3/4" : "w-1/2")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
