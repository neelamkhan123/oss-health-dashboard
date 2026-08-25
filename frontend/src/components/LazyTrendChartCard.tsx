import { lazy } from "react";
import { Card, Skeleton } from "@neelamkhan21/ui";

// Part 13.2: Recharts is the single biggest dependency this dashboard pulls
// in, and TrendChartCard is the only thing that imports it. One shared
// lazy() reference (not one per call site) so Overview and Compare both
// resolve to the same chunk rather than Rollup having to dedupe two
// separately-declared lazy wrappers of the same module.
export const LazyTrendChartCard = lazy(() =>
  import("./TrendChartCard").then((m) => ({ default: m.TrendChartCard })),
);

/**
 * Suspense fallback for LazyTrendChartCard — sized to match the real card
 * (header + a 280px plot) so its arrival doesn't shift the page, the same
 * concern the library's own Skeleton docs describe. Shared by Overview and
 * Compare, the same two callers that share LazyTrendChartCard itself.
 */
export function TrendChartCardSkeleton() {
  return (
    <Card className="flex flex-col gap-5 p-6">
      <Skeleton className="h-4 w-45" />
      <Skeleton className="h-70 w-full" />
    </Card>
  );
}
