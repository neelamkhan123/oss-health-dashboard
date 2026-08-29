import {
  Card,
  Chart,
  ChartLegend,
  ChartLegendItem,
  ChartDataTable,
  Toggle,
} from "@neelamkhan21/ui";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from "recharts";
import { trailingMonths, repoColor, type RepoStats } from "../lib/types";
import { TRACKED_REPOS } from "../lib/constants";

/** Which of the two per-repo time series the trend chart is showing. */
export type TrendMetric = "merge" | "issue";

const METRIC_COPY: Record<TrendMetric, { title: string; description: string }> = {
  merge: {
    title: "Time to merge",
    description: "Median hours from pull request open to merge, by month.",
  },
  issue: {
    title: "Issue first response",
    description:
      "Median hours from issue open to first maintainer reply, by month.",
  },
};

type TrendRow = Record<string, string | number>;

/**
 * The twelve-month trend chart, with a two-button switch between the two
 * metrics it can plot. Overview shows every tracked repo; Compare shows
 * only the selected ones — same card, same switch, different series list.
 *
 * The metric lives in the *caller's* state rather than here so the title,
 * the description and the plotted series can't disagree with each other,
 * and so a page showing this chart twice would keep both in step.
 */
export function TrendChartCard({
  repos,
  metric,
  onMetricChange,
  height = 280,
}: {
  repos: RepoStats[];
  metric: TrendMetric;
  onMetricChange: (metric: TrendMetric) => void;
  height?: number;
}) {
  const copy = METRIC_COPY[metric];
  const months = trailingMonths();

  // One row per month, one column per repo — the shape both Recharts and
  // ChartDataTable want.
  const data: TrendRow[] = months.map((month, i) => {
    const row: TrendRow = { month };
    repos.forEach((repo) => {
      row[repo.id] = metric === "merge" ? repo.trendMerge[i] : repo.trendIssue[i];
    });
    return row;
  });

  return (
    <Card className="relative p-6">
      {/* Absolutely positioned so the switch sits on the chart's own caption
       * line, as the design has it. Chart renders caption-first inside a
       * <figure>, and it owns the accessible plumbing (the reserved plot
       * box, the aria-hidden plot, the data-table equivalent), so it's
       * worth keeping intact rather than hand-rolling a card header that
       * would have to reproduce all of that. */}
      <div className="absolute right-6 top-6 z-10 flex items-center gap-1.5">
        <Toggle
          variant="outline"
          size="sm"
          pressed={metric === "merge"}
          onPressedChange={() => onMetricChange("merge")}
        >
          Merge time
        </Toggle>
        <Toggle
          variant="outline"
          size="sm"
          pressed={metric === "issue"}
          onPressedChange={() => onMetricChange("issue")}
        >
          Issue response
        </Toggle>
      </div>

      <Chart
        title={copy.title}
        description={copy.description}
        height={height}
        legend={
          <ChartLegend>
            {repos.map((repo) => (
              <ChartLegendItem key={repo.id} color={repoColor(repo.id, TRACKED_REPOS)}>
                {repo.id}
              </ChartLegendItem>
            ))}
          </ChartLegend>
        }
        dataTable={
          <ChartDataTable
            caption={`${copy.title}, in hours, by month`}
            columns={[
              { header: "Month", cell: (row: TrendRow) => row.month },
              ...repos.map((repo) => ({
                header: repo.id,
                cell: (row: TrendRow) => row[repo.id],
              })),
            ]}
            data={data}
          />
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          {/* No negative left margin, and no fixed YAxis width: merge/response
           * time is medians in hours, and an unhealthy repo's monthly median
           * can run into four digits (a real synced repo has hit 2400+).
           * A negative margin plus a width picked for 3-digit values pushed
           * any 4-digit tick's leading character(s) past the SVG's own
           * x=0 edge, which clips there (SVGs clip like `overflow: hidden`
           * by default) — "2400" silently rendered as "400". Omitting
           * `width` lets Recharts measure each tick label and reserve
           * exactly the space the widest one actually needs, so this
           * can't reoccur at some larger number either. */}
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis tickLine={false} axisLine={false} fontSize={12} />
            <RechartsTooltip />
            {repos.map((repo) => (
              <Line
                key={repo.id}
                type="monotone"
                dataKey={repo.id}
                stroke={repoColor(repo.id, TRACKED_REPOS)}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Chart>
    </Card>
  );
}
