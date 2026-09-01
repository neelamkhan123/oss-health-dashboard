import { Skeleton, Card } from "neelam-ui";

export function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <Skeleton className="size-3.5 rounded-full" />
        <span>Loading dashboard data</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="flex flex-col gap-4 p-5">
            <Skeleton className="h-3 w-28" />
            <div className="flex items-end justify-between gap-4">
              <Skeleton className="h-7 w-22" />
              <Skeleton className="h-8 w-24" />
            </div>
          </Card>
        ))}
      </div>
      <Card className="flex flex-col gap-3.5 p-6">
        <Skeleton className="h-4 w-55" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </Card>
    </div>
  );
}
