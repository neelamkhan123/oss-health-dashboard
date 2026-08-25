import { Chart, ChartDataTable, Card } from "@neelamkhan21/ui";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from "recharts";
import {
  MERGE_TIME_BUCKETS,
  PERCENTILE_SCALE_DAYS,
  percentileDays,
  type MockRepo,
} from "../lib/mockData";

type BucketRow = { bucket: string; prs: number };

/**
 * How long merged PRs stayed open: a histogram, and the percentiles that
 * summarise its tail.
 *
 * Placeholder content — both come from the per-repo mock dataset until
 * GET /repos/{id}/merge-time-distribution exists. See BUILD_GUIDE.md
 * Part 9.9 for the bucket-edge and percentile-source decisions still open.
 */
export function MergeTimeDistribution({ repo }: { repo: MockRepo }) {
  const data: BucketRow[] = MERGE_TIME_BUCKETS.map((bucket, i) => ({
    bucket,
    prs: repo.dist[i],
  }));
  const total = repo.dist.reduce((sum, count) => sum + count, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card className="p-6">
        <Chart
          title="Pull request merge time"
          description={`Distribution of the last ${total.toLocaleString("en-US")} merged pull requests.`}
          height={220}
          // No legend: there is one series, and the chart's own title
          // already names it. A one-item legend is pure noise.
          dataTable={
            <ChartDataTable
              caption="Merged pull requests by how long they stayed open"
              columns={[
                { header: "Time open", cell: (row: BucketRow) => row.bucket },
                { header: "PRs merged", cell: (row: BucketRow) => row.prs },
              ]}
              data={data}
            />
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="bucket" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} width={44} />
              <RechartsTooltip />
              <Bar dataKey="prs" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Chart>
      </Card>

      <Percentiles repo={repo} />
    </div>
  );
}

/**
 * p50/p75/p90/p95, each as a value and a bar.
 *
 * One card holding four rows, not four stat tiles: these are four readings
 * off a single distribution, and the interesting thing about them is the
 * *shape* they trace — how far p95 runs past p50. Four equal boxes state
 * the numbers but hide that shape; bars on a shared scale are the shape.
 */
function Percentiles({ repo }: { repo: MockRepo }) {
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
