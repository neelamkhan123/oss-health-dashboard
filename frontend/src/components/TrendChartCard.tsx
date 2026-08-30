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

/** Which of the two per-repo time series the trend chart is showing. */
export type TrendMetric = "merge" | "issue";

const METRIC_COPY: Record<TrendMetric, { title: string; description: string }> =
  {
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
 *
 * Title and switch sit in their own row above the card, the same layout as
 * every other section on these pages (Core metrics, Contributor
 * leaderboard) — a lone chart is the only thing inside the card itself.
 * `Chart` still receives `title`/`description`: it's what supplies the
 * `<figure>`'s `aria-labelledby`/`aria-describedby`, so rather than drop
 * them (and the accessible name that comes with them) or show the same
 * heading twice, its own figcaption is hidden with a scoped `sr-only`
 * override — the assistive-tech wiring stays intact, pointing at text
 * that's identical to the one now visible above.
 */
export function TrendChartCard({
  repos,
  trackedRepoNames,
  metric,
  onMetricChange,
  height = 280,
}: {
  repos: RepoStats[];
  /** The full tracked-repo list, for stable per-repo colors — not derived
   *  from `repos` itself, since Compare passes only the *selected* subset
   *  there, and a repo's color shouldn't shift depending on which other
   *  repos happen to be selected alongside it. */
  trackedRepoNames: string[];
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
      row[repo.id] =
        metric === "merge" ? repo.trendMerge[i] : repo.trendIssue[i];
    });
    return row;
  });

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col sm:flex-row sm:items-center items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="m-0 text-sm font-semibold text-slate-950 dark:text-white">
            {copy.title}
          </h2>
          <p className="m-0 text-xs text-slate-500 dark:text-slate-400">
            {copy.description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
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
      </div>

      <Card className="p-6 [&_figcaption]:sr-only">
        <Chart
          title={copy.title}
          description={copy.description}
          height={height}
          legend={
            <ChartLegend>
              {repos.map((repo) => (
                <ChartLegendItem
                  key={repo.id}
                  color={repoColor(repo.id, trackedRepoNames)}
                >
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
            <LineChart
              data={data}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                fontSize={12}
              />
              <YAxis tickLine={false} axisLine={false} fontSize={12} />
              <RechartsTooltip />
              {repos.map((repo) => (
                <Line
                  key={repo.id}
                  type="monotone"
                  dataKey={repo.id}
                  stroke={repoColor(repo.id, trackedRepoNames)}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Chart>
      </Card>
    </div>
  );
}
