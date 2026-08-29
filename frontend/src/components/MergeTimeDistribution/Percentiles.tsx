import { Card } from "@neelamkhan21/ui";
import { PERCENTILE_SCALE_DAYS, percentileDays, type RepoStats } from "../../lib/types";

/**
 * p50/p75/p90/p95, each as a value and a bar.
 *
 * One card holding four rows, not four stat tiles: these are four readings
 * off a single distribution, and the interesting thing about them is the
 * *shape* they trace — how far p95 runs past p50. Four equal boxes state
 * the numbers but hide that shape; bars on a shared scale are the shape.
 */
export function Percentiles({ repo }: { repo: RepoStats }) {
  return (
    <Card className="flex flex-col gap-4 p-6">
      <h2 className="m-0 text-sm font-semibold text-slate-950 dark:text-white">
        Percentiles
      </h2>
      <div className="flex flex-col gap-3">
        {repo.pct.map(([label, value]) => {
          // Scaled against the worst p95 across every tracked repo, not this
          // repo's own — see PERCENTILE_SCALE_DAYS. That's what makes these
          // bars comparable when you flick between two repos' pages.
          const width = Math.min(
            100,
            (percentileDays(value) / PERCENTILE_SCALE_DAYS) * 100,
          );
          return (
            <div key={label} className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">{label}</span>
                <span className="font-medium tabular-nums text-slate-950 dark:text-white">
                  {value}
                </span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full"
                style={{ background: "var(--surface-subtle)" }}
              >
                <div
                  className="h-full"
                  style={{ width: `${width}%`, background: "var(--chart-1)" }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
