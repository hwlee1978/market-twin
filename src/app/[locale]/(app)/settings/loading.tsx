import { HeaderSkeleton, Skeleton } from "@/components/ui/Skeleton";

export default function SettingsLoading() {
  return (
    <>
      <HeaderSkeleton />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-64" />
          <Skeleton className="h-9 w-full max-w-md" />
        </div>
      ))}
    </>
  );
}
