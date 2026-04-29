import {
  HeaderSkeleton,
  KpiRowSkeleton,
  Skeleton,
  TableSkeleton,
} from "@/components/ui/Skeleton";

export default function DashboardLoading() {
  return (
    <>
      <HeaderSkeleton />

      {/* Hero card placeholder for the new-user demo card OR returning-user
          KPI strip — same vertical footprint either way so the swap-in
          when the real page lands isn't jarring. */}
      <div className="card">
        <Skeleton className="h-4 w-24 mb-4" />
        <Skeleton className="h-6 w-64 mb-3" />
        <Skeleton className="h-4 w-96 mb-2" />
        <Skeleton className="h-4 w-80 mb-6" />
        <Skeleton className="h-10 w-40" />
      </div>

      <KpiRowSkeleton />
      <TableSkeleton rows={5} cols={4} />
    </>
  );
}
