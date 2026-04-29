import { HeaderSkeleton, Skeleton } from "@/components/ui/Skeleton";

export default function TeamLoading() {
  return (
    <>
      <HeaderSkeleton />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-2 space-y-3">
          <Skeleton className="h-5 w-32 mb-3" />
          {Array.from({ length: 1 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-3">
              <Skeleton className="h-9 w-9 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
        <div className="card space-y-3">
          <Skeleton className="h-5 w-32 mb-2" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
    </>
  );
}
