import {
  Card,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "neelam-ui";
import type { RepoStats, MetricValue } from "../../lib/types";

/**
 * The rows of the comparison table, in reading order.
 *
 * `lower` is what makes "best" meaningful: a shorter time to merge is good
 * news, a higher merge rate is good news, and a table that marked the
 * maximum in every row would call the slowest repo the winner half the
 * time. It's the same distinction StatCard draws with `deltaDirection`.
 *
 * A function of `days`, not a static list: the "Contributors" row's label
 * names the window it's counted over, same as Overview's StatCard.
 */
function compareRows(days: number): { label: string; read: (repo: RepoStats) => MetricValue; lower: boolean }[] {
  return [
    { label: "Avg. time to merge", read: (r) => r.merge, lower: true },
    { label: "Median first response", read: (r) => r.response, lower: true },
    { label: "Merge rate", read: (r) => r.mergeRate, lower: false },
    { label: `Contributors, ${days} days`, read: (r) => r.contrib, lower: false },
    { label: "Open issues", read: (r) => r.issues, lower: true },
    { label: "Commits per week", read: (r) => r.commits, lower: false },
  ];
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
export function CoreMetrics({ selected, days }: { selected: RepoStats[]; days: number }) {
  const rows = compareRows(days);
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
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
       * six fixed metric rows. Still styled to match StyledDataTable's
       * header (gray background, padding, corner clip) by hand, for the
       * same "every table in this app looks like this" reason. */}
      <Card className="overflow-hidden [&_thead_th]:whitespace-nowrap [&_thead_th]:bg-slate-50 [&_thead_th]:py-3 [&_thead_th]:border-b [&_thead_th]:border-slate-200 dark:[&_thead_th]:bg-slate-900 dark:[&_thead_th]:border-slate-800">
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
              {rows.map((row) => {
                const values = selected
                  .map((repo) => row.read(repo).v)
                  .filter((v): v is number => v !== null);
                // A tie across every value (most often 0 across the board,
                // before a metric has any real data yet) isn't a "best" —
                // marking all of them would say nothing except that nothing
                // has synced. Only a value strictly ahead of at least one
                // other counts.
                const allTied = values.length > 0 && values.every((v) => v === values[0]);
                const best = values.length && !allTied ? (row.lower ? Math.min(...values) : Math.max(...values)) : null;
                return (
                  <TableRow key={row.label}>
                    <TableCell className="text-slate-600 dark:text-slate-300">
                      {row.label}
                    </TableCell>
                    {selected.map((repo) => {
                      const value = row.read(repo);
                      // Nothing is "best" when there's only one column, or
                      // when this repo has no value for the row at all (e.g.
                      // response time before any first-response is backfilled).
                      const isBest = selected.length > 1 && best !== null && value.v === best;
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
    </div>
  );
}
