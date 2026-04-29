import {
  HeaderSkeleton,
  KpiRowSkeleton,
  TableSkeleton,
} from "@/components/ui/Skeleton";

/**
 * Default skeleton shown for any (app) route segment that doesn't define
 * its own loading.tsx. Mirrors the most common page shape — page header +
 * KPI strip + table — so the layout shift when the real page lands is
 * minimal.
 */
export default function AppLoading() {
  return (
    <>
      <HeaderSkeleton />
      <KpiRowSkeleton />
      <TableSkeleton rows={5} cols={4} />
    </>
  );
}
