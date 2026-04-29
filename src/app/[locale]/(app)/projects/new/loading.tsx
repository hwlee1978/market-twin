import { HeaderSkeleton, Skeleton } from "@/components/ui/Skeleton";

/**
 * Wizard skeleton — matches the vertical footprint of ProjectWizard so
 * the swap-in when the real page lands doesn't shift the layout. Five
 * step pills (matching STEPS = product/pricing/countries/competitors/
 * review), then the card frame for the current-step form, then a
 * back/next button row.
 */
export default function NewProjectLoading() {
  return (
    <div className="max-w-3xl mx-auto">
      <HeaderSkeleton />

      {/* Stepper — 5 number pills + labels + connector lines */}
      <div className="mt-6 mb-8 flex items-center gap-1.5 flex-wrap">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-3 w-14" />
            {i < 4 && <Skeleton className="h-px w-5 mx-0.5" />}
          </div>
        ))}
      </div>

      {/* Form card — title-less, just field blocks */}
      <div className="card space-y-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-64" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>

      {/* Back / Next button row */}
      <div className="mt-6 flex items-center justify-between">
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-24" />
      </div>
    </div>
  );
}
