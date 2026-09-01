import { Chart, ChartDataTable, Card } from "neelam-ui";
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
  type RepoStats,
} from "../../lib/types";
import { Percentiles } from "./Percentiles";

type BucketRow = { bucket: string; prs: number };

/**
 * How long merged PRs stayed open: a histogram, and the percentiles that
 * summarise its tail. Both come from `repo.dist`/`repo.pct`, computed
 * server-side in compute_repo_full from every merged PR's own
 * created_at/merged_at — real durations, bucketed and ranked in Python
 * once per request rather than in SQL, since the row counts here are
 * small enough that fetching once and bucketing client-side (well,
 * server-side) is simpler than a SQL histogram.
 */
export function MergeTimeDistribution({ repo }: { repo: RepoStats }) {
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
            {/* No negative left margin, no fixed YAxis width — see
             * TrendChartCard's identical comment. A busy repo's PR count in
             * one bucket can run to 4 digits just as easily as a merge-time
             * median can; the same clipping bug applies here. */}
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="bucket" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} />
              <RechartsTooltip />
              <Bar dataKey="prs" fill="var(--accent)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Chart>
      </Card>

      <Percentiles repo={repo} />
    </div>
  );
}
