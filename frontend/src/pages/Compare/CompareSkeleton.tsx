import { Card, Skeleton } from "@neelamkhan21/ui";

export function CompareSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="flex flex-col gap-4 p-5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-7 w-22" />
          </Card>
        ))}
      </div>
      <Skeleton className="h-56 w-full" />
    </div>
  );
}
