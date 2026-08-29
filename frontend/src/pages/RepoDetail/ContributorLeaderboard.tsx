import { useEffect, useState } from "react";
import {
  AvatarGroup,
  Avatar,
  AvatarFallback,
  type DataTableColumn,
} from "@neelamkhan21/ui";
import { StyledDataTable } from "../../components/StyledDataTable";
import { fetchContributors } from "../../lib/api";
import type { ContributorRow } from "../../lib/types";

function initials(login: string): string {
  const letters = login.replace(/[^a-z]/gi, "");
  return (letters.slice(0, 2) || login.slice(0, 2)).toUpperCase();
}

const contributorColumns: DataTableColumn<ContributorRow>[] = [
  {
    key: "login",
    header: "Contributor",
    sortable: true,
    cell: (row) => (
      <div className="flex items-center gap-2.5">
        <Avatar size="sm">
          <AvatarFallback>{initials(row.login)}</AvatarFallback>
        </Avatar>
        <span className="font-medium">{row.login}</span>
      </div>
    ),
  },
  { key: "commits", header: "Commits", align: "right", sortable: true },
  { key: "prs", header: "PRs merged", align: "right", sortable: true },
  { key: "reviews", header: "Reviews", align: "right", sortable: true },
  {
    key: "last",
    header: "Last active",
    align: "right",
    // Not sortable: pre-formatted relative strings ("2h ago", "12d ago")
    // would sort alphabetically, putting "12d" before "2h".
    cell: (row) => (
      <span className="text-slate-500 dark:text-slate-400">{row.last}</span>
    ),
  },
];

/**
 * `initialTop` (from the parent's already-fetched `/full` response) renders
 * immediately; a `/contributors` fetch behind it fills in the complete,
 * independently-sortable roster (`/full` caps at the top 10). Tagged with
 * the repo it was fetched for, so navigating between two repos can't show
 * one repo's contributors under the other's heading while the second fetch
 * is in flight.
 */
export function ContributorLeaderboard({
  repoId,
  initialTop,
}: {
  repoId: string;
  initialTop: ContributorRow[];
}) {
  const [fetched, setFetched] = useState<{ repoId: string; rows: ContributorRow[] } | null>(null);

  const rows = fetched?.repoId === repoId ? fetched.rows : initialTop;

  useEffect(() => {
    fetchContributors(repoId)
      .then((data) => setFetched({ repoId, rows: data }))
      .catch(() => {
        // initialTop is already in state — nothing to do.
      });
  }, [repoId]);

  // DataTable has no "default sort" prop (sorting is click-to-sort only) —
  // pre-sort the rows we hand it instead, most commits first.
  const sorted = [...rows].sort((a, b) => b.commits - a.commits);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="m-0 text-sm font-semibold text-slate-950 dark:text-white">
            Contributor leaderboard
          </h2>
          <p className="m-0 text-xs text-slate-500 dark:text-slate-400">
            Sortable. Ranked by commits.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Top this month
          </span>
          <AvatarGroup label="Top contributors" size="sm" max={5}>
            {sorted.slice(0, 5).map((c) => (
              <Avatar key={c.login}>
                <AvatarFallback>{initials(c.login)}</AvatarFallback>
              </Avatar>
            ))}
          </AvatarGroup>
        </div>
      </div>
      <StyledDataTable columns={contributorColumns} data={sorted} getRowId={(r) => r.login} />
    </div>
  );
}
