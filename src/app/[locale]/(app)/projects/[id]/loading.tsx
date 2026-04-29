import { HeaderSkeleton, Skeleton } from "@/components/ui/Skeleton";

export default function ProjectDetailLoading() {
  return (
    <>
      <HeaderSkeleton />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-2 space-y-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-3/4" />
          <div className="grid grid-cols-2 gap-4 pt-4">
            <div className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </div>
        <div className="card space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-9 w-full mt-4" />
        </div>
      </div>
    </>
  );
}
