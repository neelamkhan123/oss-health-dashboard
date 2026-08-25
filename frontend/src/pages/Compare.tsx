import { Suspense, useState, type CSSProperties } from "react";
import {
  Toggle,
  EmptyState,
  Card,
  StatCard,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@neelamkhan21/ui";
import { Layers } from "lucide-react";
import { LazyTrendChartCard, TrendChartCardSkeleton } from "../components/LazyTrendChartCard";
import type { TrendMetric } from "../components/TrendChartCard";
import { MOCK_REPOS, type MockRepo, type MetricValue } from "../lib/mockData";

/**
 * The rows of the comparison table, in reading order.
 *
 * `lower` is what makes "best" meaningful: a shorter time to merge is good
 * news, a higher merge rate is good news, and a table that marked the
 * maximum in every row would call the slowest repo the winner half the
 * time. It's the same distinction StatCard draws with `deltaDirection`.
 */
const COMPARE_ROWS: { label: string; read: (repo: MockRepo) => MetricValue; lower: boolean }[] = [
  { label: "Avg. time to merge", read: (r) => r.merge, lower: true },
  { label: "Median first response", read: (r) => r.response, lower: true },
  { label: "Merge rate", read: (r) => r.mergeRate, lower: false },
  { label: "Contributors, 90 days", read: (r) => r.contrib, lower: false },
  { label: "Open issues", read: (r) => r.issues, lower: true },
  { label: "Commits per week", read: (r) => r.commits, lower: false },
];

export function Compare() {
  const [selectedIds, setSelectedIds] = useState<string[]>(
    MOCK_REPOS.map((repo) => repo.id),
  );
  const [metric, setMetric] = useState<TrendMetric>("merge");

  // Filtered from MOCK_REPOS rather than built from the toggle order, so
  // columns and chart series stay in the sidebar's order however the
  // toggles were clicked.
  const selected = MOCK_REPOS.filter((repo) => selectedIds.includes(repo.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-2xl leading-tight font-semibold tracking-tight text-slate-950 dark:text-white">
            Compare repositories
          </h1>
          <p className="m-0 text-xs text-slate-500 dark:text-slate-400">
            Same window, same definitions. Merge time is measured from first commit
            push to merge.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {MOCK_REPOS.map((repo) => (
            <Toggle
              key={repo.id}
              variant="outline"
              size="sm"
              pressed={selectedIds.includes(repo.id)}
              onPressedChange={(pressed: boolean) =>
                setSelectedIds((prev) =>
                  pressed ? [...prev, repo.id] : prev.filter((id) => id !== repo.id),
                )
              }
            >
              {repo.short}
            </Toggle>
          ))}
        </div>
      </div>

      {selected.length === 0 ? (
        <EmptyState
          icon={<Layers size={20} />}
          title="No repositories selected"
          description="Choose at least two repositories above to compare them."
          live
        />
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
            {selected.map((repo) => (
              <StatCard
                key={repo.id}
                label={repo.id}
                value={metric === "merge" ? repo.merge.d : repo.response.d}
                trend={metric === "merge" ? repo.trendMerge : repo.trendIssue}
                // Tints only the sparkline, not the card's text, so each
                // repo's tile carries the same color as its line in the
                // chart below. Sparkline draws in currentColor and StatCard
                // gives it a tone class; a descendant selector out-specifies
                // that without having to fight the merge order. These cards
                // have no `icon`, so the sparkline is the only svg matched.
                style={{ "--repo-color": repo.color } as CSSProperties}
                className="[&_svg]:text-(--repo-color)"
              >
                {/* The caption goes in `children`, not `deltaLabel`:
                 * StatCard only renders a deltaLabel beside a `delta`, and
                 * `delta` is a signed ratio with no honest value here —
                 * neither metric has a previous-period figure to compare
                 * against yet. Faking `delta={0}` to unlock the label would
                 * render a "no change" indicator, which is a claim about
                 * the data rather than a caption. */}
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {metric === "merge" ? "avg. time to merge" : "median first response"}
                </span>
              </StatCard>
            ))}
          </div>

          <CoreMetrics selected={selected} />

          <Suspense fallback={<TrendChartCardSkeleton />}>
            <LazyTrendChartCard
              repos={selected}
              metric={metric}
              onMetricChange={setMetric}
            />
          </Suspense>
        </>
      )}
    </div>
  );
}

/**
 * The metric table, transposed: one column per repo, one row per metric.
 *
 * The natural orientation (a row per repo) is the wrong one here. Comparing
 * two repos on merge time means reading two numbers, and in a row-per-repo
 * table those sit in different rows and different vertical positions.
 * Transposed, every metric's values line up on one line, which is the only
 * arrangement where "who's fastest" is a glance rather than a search — and
 * it's what makes marking the best value per row possible at all.
 */
function CoreMetrics({ selected }: { selected: MockRepo[] }) {
  return (
    <Card className="p-6">
      <div className="mb-3 flex flex-col gap-1.5">
        <h2 className="m-0 text-sm font-semibold text-slate-950 dark:text-white">
          Core metrics
        </h2>
        <p className="m-0 text-xs text-slate-500 dark:text-slate-400">
          Best value in each row is marked.
        </p>
      </div>
      {/* Table, not DataTable: DataTable is driven by a columns/data pair
       * where each row is one record, which is exactly the orientation this
       * table inverts. Sorting and filtering would also be meaningless over
       * six fixed metric rows. */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              {selected.map((repo) => (
                <TableHead key={repo.id} className="text-right">
                  {repo.id}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {COMPARE_ROWS.map((row) => {
              const values = selected.map((repo) => row.read(repo).v);
              const best = row.lower ? Math.min(...values) : Math.max(...values);
              return (
                <TableRow key={row.label}>
                  <TableCell className="text-slate-600 dark:text-slate-300">
                    {row.label}
                  </TableCell>
                  {selected.map((repo) => {
                    const value = row.read(repo);
                    // Nothing is "best" when there's only one column —
                    // a single repo compared against itself always wins.
                    const isBest = selected.length > 1 && value.v === best;
                    return (
                      <TableCell key={repo.id} className="text-right tabular-nums">
                        <span
                          className={`inline-flex items-center justify-end gap-2 ${
                            isBest ? "font-semibold" : ""
                          }`}
                        >
                          {value.d}
                          {isBest ? <Badge variant="outline">Best</Badge> : null}
                        </span>
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
