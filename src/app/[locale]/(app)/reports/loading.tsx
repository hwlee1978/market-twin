import {
  HeaderSkeleton,
  Skeleton,
  TableSkeleton,
} from "@/components/ui/Skeleton";

export default function ReportsLoading() {
  return (
    <>
      <HeaderSkeleton />
      <Skeleton className="h-10 w-80" />
      <TableSkeleton rows={6} cols={6} />
    </>
  );
}
