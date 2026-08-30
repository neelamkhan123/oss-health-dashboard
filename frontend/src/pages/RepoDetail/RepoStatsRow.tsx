import { Card } from "@neelamkhan21/ui";
import type { RepoStats } from "../../lib/types";

/**
 * The six headline counts, as one card divided into cells rather than six
 * StatCards.
 *
 * These are a repo's *description* — stars, forks, how much is open — not
 * six independent KPIs. A StatCard is a claim about movement (it carries a
 * delta and a sparkline), and none of these six have one to show, so six of
 * them would be six mostly-empty cards. One card with hairlines between the
 * numbers says "these belong together and none of them are trending",
 * which is the truth, in a sixth of the vertical space.
 */
export function RepoStatsRow({ repo }: { repo: RepoStats }) {
  const stats: [string, string][] = [
    ["Stars", repo.stars],
    ["Forks", repo.forks],
    ["Open PRs", repo.openPrs],
    ["Open issues", repo.issues.d],
    ["Contributors", repo.contrib.d],
    ["Commits / week", repo.commits.d],
  ];

  return (
    <div className="flex flex-wrap gap-3 items-stretch overflow-hidden">
      {stats.map(([label, value], i) => (
        <Card key={label} className="flex flex-1 flex-col gap-1.5 px-5 py-4">
          <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
            {label}
          </span>
          <span className="text-xl font-semibold tracking-tight tabular-nums text-slate-950 dark:text-white">
            {value}
          </span>
        </Card>
      ))}
    </div>
  );
}
