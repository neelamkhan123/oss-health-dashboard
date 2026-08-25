import { Card } from "@neelamkhan21/ui";
import { trailingMonths, type RepoStats } from "../lib/types";

/**
 * A day's cell color, stepped through the primary series hue rather than
 * given its own scale.
 *
 * Sequential, not categorical: the four filled steps are one hue at rising
 * opacity, so "more commits" reads as "darker" without a legend — which is
 * the whole point of a heatmap, and which a multi-hue ramp destroys. It's
 * `--chart-1` deliberately, so the densest days match the bar chart and the
 * percentile bars further down the page instead of introducing a fifth
 * color to the screen. Zero gets the neutral surface, not the lightest step
 * — "no commits" is a different statement from "few commits".
 *
 * The steps themselves live in index.css (`--heat-1..3`), which is what
 * lets them be re-stepped for dark mode; see the note there.
 */
function heatColor(value: number): string {
  if (value === 0) return "var(--surface-subtle)";
  if (value < 4) return "var(--heat-1)";
  if (value < 8) return "var(--heat-2)";
  if (value < 12) return "var(--heat-3)";
  return "var(--chart-1)";
}

/** The values the legend swatches stand for — one per heatColor step. */
const LEGEND_VALUES = [0, 2, 6, 10, 16];

/** Only every other row is labelled, as GitHub's own graph does it. */
const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

const CELL = 11;
const GAP = 3;
/** Width of the day-of-week gutter, including its margin. Fixed rather than
 *  content-sized so the month strip below can be offset by exactly it. */
const GUTTER = 36;

/**
 * A GitHub-style commit-activity grid: 53 weeks across, 7 days down.
 *
 * `repo.heatmap` is real data — a Commit row per synced commit, grouped by
 * day server-side (see compute_repo_full). It'll read as sparse/empty
 * until a sync actually runs with a real GitHub token; that's the true
 * state of the data, not a placeholder standing in for it.
 */
export function CommitHeatmap({ repo }: { repo: RepoStats }) {
  const weeks = repo.heatmap;
  const months = trailingMonths();

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="m-0 text-sm font-semibold text-slate-950 dark:text-white">
            Commit activity
          </h2>
          <p className="m-0 text-xs text-slate-500 dark:text-slate-400">
            {repo.commitsTotal} commits in the last 12 months, {repo.commits.d} per
            week on average.
          </p>
        </div>
        <div
          className="flex shrink-0 items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
          aria-hidden="true"
        >
          Less
          <span className="flex" style={{ gap: GAP }}>
            {LEGEND_VALUES.map((value) => (
              <span
                key={value}
                style={{
                  width: CELL,
                  height: CELL,
                  borderRadius: 2,
                  background: heatColor(value),
                }}
              />
            ))}
          </span>
          More
        </div>
      </div>

      <div className="overflow-x-auto">
        {/* w-fit, so this column shrinks to the grid's own width instead of
         * stretching to the card. Without it the month strip below spreads
         * its twelve labels across the full card width while the grid stops
         * short, and the two stop lining up. */}
        <div className="flex w-fit flex-col">
          <div className="flex items-start">
            <div
              className="flex shrink-0 flex-col text-xs text-slate-500 dark:text-slate-400"
              style={{ gap: GAP, lineHeight: `${CELL}px`, width: GUTTER }}
              aria-hidden="true"
            >
              {DAY_LABELS.map((label, i) => (
                <span key={i} style={{ height: CELL }}>
                  {label}
                </span>
              ))}
            </div>
            <div
              className="flex"
              style={{ gap: GAP }}
              role="img"
              aria-label={`Commit activity for ${repo.id} over the last 12 months: ${repo.commitsTotal} commits, ${repo.commits.d} per week on average.`}
            >
              {weeks.map((days, week) => (
                <div key={week} className="flex flex-col" style={{ gap: GAP }}>
                  {days.map((value, day) => (
                    <div
                      key={day}
                      title={`${value} commit${value === 1 ? "" : "s"}`}
                      style={{
                        width: CELL,
                        height: CELL,
                        borderRadius: 2,
                        background: heatColor(value),
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div
            className="mt-2 flex text-xs text-slate-500 dark:text-slate-400"
            // Offset past the day-label gutter and sized to exactly the
            // grid — 53 cells plus the 52 gaps between them — so the twelve
            // labels divide the same span the weeks do.
            style={{
              marginLeft: GUTTER,
              width: weeks.length * CELL + (weeks.length - 1) * GAP,
            }}
            aria-hidden="true"
          >
            {months.map((month) => (
              <span key={month} className="flex-1">
                {month}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
