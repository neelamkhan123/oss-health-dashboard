import { Chart, ChartLegendItem, ChartDataTable, Card } from "@neelamkhan21/ui";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import type { RepoStats } from "../lib/types";
import { languageColor } from "../lib/languageColors";

/** Segments under this share of the repo still get their own wedge (the
 *  proportions stay honest) but are folded into a single "Other" entry in
 *  the legend — a legend row for a 0.1% language is more clutter than
 *  signal. */
const LEGEND_MIN_PCT = 1;

/** Legend rows before the rest folds into "Other", on top of the percentage
 *  floor above. A hard cap, not just the floor, because the legend sits in
 *  a fixed-height plot box beside the pie — a polyglot repo with a dozen
 *  languages over 1% would otherwise grow the list straight out of it. */
const MAX_LEGEND_ROWS = 5;

type LangRow = { name: string; pct: number; bytes: number };

/**
 * GitHub's own "Languages" breakdown, rebuilt from `repo.languages` (bytes
 * of code per language — see compute_repo_full's `_language_breakdown`)
 * rather than the single `lang` field the header badge shows: that field is
 * linguist's one guess at the repo's *primary* language, this is the full
 * mix. A pie rather than the linear bar GitHub itself uses, since this card
 * sits beside CommitHeatmap and gets a square-ish box to fill.
 *
 * Renders nothing (not an empty card) for a repo that hasn't synced since
 * this was added — `repo.languages` is `[]` until then.
 */
export function LanguageChart({ repo }: { repo: RepoStats }) {
  const languages: LangRow[] = repo.languages;
  if (languages.length === 0) return null;

  const legendRows = languages
    .filter((l) => l.pct >= LEGEND_MIN_PCT)
    .slice(0, MAX_LEGEND_ROWS);
  // Everything the legend didn't name, whichever rule dropped it.
  const named = new Set(legendRows.map((l) => l.name));
  const otherPct = languages
    .filter((l) => !named.has(l.name))
    .reduce((sum, l) => sum + l.pct, 0);

  return (
    <Card className="h-full p-6">
      <Chart
        title="Languages"
        description={`${languages.length} language${languages.length === 1 ? "" : "s"}, by bytes of code.`}
        // Sized so this card lands close to CommitHeatmap's natural height
        // beside it — the row is as tall as this card, and every pixel over
        // the heatmap's own content shows as hollow space in its card.
        // MAX_LEGEND_ROWS + "Other" is what has to fit here.
        height={150}
        // The legend is rendered *inside* the plot box below rather than
        // passed as `legend`, which is what puts it beside the pie instead
        // of stacked above it — the card is far wider than a pie needs, and
        // stacking spent that width as height instead (leaving the row
        // taller than CommitHeatmap next to it). Chart marks the plot box
        // aria-hidden, so this legend is decoration only; `dataTable` below
        // carries every language and share, which is a superset of what the
        // legend shows, so nothing is lost for assistive tech.
        dataTable={
          <ChartDataTable
            caption={`Language breakdown for ${repo.id}`}
            columns={[
              { header: "Language", cell: (row: LangRow) => row.name },
              { header: "Share", cell: (row: LangRow) => `${row.pct}%` },
            ]}
            data={languages}
          />
        }
      >
        <div className="flex h-full items-center gap-5">
          <div className="h-full min-w-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={languages}
                  dataKey="pct"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius="90%"
                  // No slice labels: with up to a dozen languages half of
                  // them are too thin for a readable label anyway —
                  // identity comes from the legend beside it and the
                  // (accessible) data table, the same division of labor
                  // Chart uses everywhere else. No stroke either: Recharts
                  // defaults Pie to a white one, which shows as a visible
                  // ring on a dark card, and adjacent languages read as one
                  // continuous whole better without gutters between them.
                  stroke="none"
                >
                  {languages.map((l) => (
                    <Cell key={l.name} fill={languageColor(l.name)} />
                  ))}
                </Pie>
                {/* Bare value formatter, not the [value, name] tuple form:
                 * the name half is already the series name Recharts reads
                 * off `nameKey`, so returning it too would print it twice. */}
                <RechartsTooltip formatter={(value) => `${value}%`} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Not ChartLegend: that's a wrapping horizontal row, and its
           * `items-center` would fight the `items-start` a vertical column
           * needs (same CSS property, so which one wins depends on
           * stylesheet order rather than on the order written here). The
           * items themselves are the library's, so the swatches still match
           * every other chart's. */}
          <ul className="flex min-w-0 flex-col gap-1.5">
            {legendRows.map((l) => (
              <ChartLegendItem key={l.name} color={languageColor(l.name)}>
                <span className="truncate">{l.name}</span>{" "}
                <span className="tabular-nums text-slate-400 dark:text-slate-500">
                  {l.pct}%
                </span>
              </ChartLegendItem>
            ))}
            {otherPct > 0 && (
              <ChartLegendItem color="var(--surface-subtle)">
                Other{" "}
                <span className="tabular-nums text-slate-400 dark:text-slate-500">
                  {otherPct.toFixed(1)}%
                </span>
              </ChartLegendItem>
            )}
          </ul>
        </div>
      </Chart>
    </Card>
  );
}
