import { HeaderSkeleton, TableSkeleton } from "@/components/ui/Skeleton";

export default function ProjectsLoading() {
  return (
    <>
      <HeaderSkeleton />
      <TableSkeleton rows={6} cols={5} />
    </>
  );
}
