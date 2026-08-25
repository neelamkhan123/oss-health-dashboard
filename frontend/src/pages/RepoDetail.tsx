import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  DataTable,
  AvatarGroup,
  Avatar,
  AvatarFallback,
  EmptyState,
  Skeleton,
  type DataTableColumn,
} from "@neelamkhan21/ui";
import { Star, ExternalLink, TriangleAlert } from "lucide-react";
import { PageHeader } from "../layout/PageHeader";
import { CommitHeatmap } from "../components/CommitHeatmap";
import { MergeTimeDistribution } from "../components/MergeTimeDistribution";
import { fetchRepoFull, fetchContributors } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import type { ContributorRow, RepoStats } from "../lib/types";

export function RepoDetail() {
  const { repoId } = useParams();
  const { isLoading, isError, data: repo, retry } = useFetch(repoId ?? "", () =>
    fetchRepoFull(repoId!),
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={repoId ?? "Repository"} />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !repo) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={repoId ?? "Repository"} />
        <EmptyState
          icon={<TriangleAlert size={20} />}
          title="Couldn't load this repository"
          description={`No data for ${repoId} — it may not be tracked, or hasn't synced yet.`}
          action={
            <Button size="sm" onClick={retry}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={repo.id}
        description={
          <span className="flex items-center gap-2">
            <Badge variant="secondary">{repo.lang}</Badge>
            <Badge variant="outline">{repo.license} license</Badge>
            <Badge variant={repo.statusVariant}>{repo.status}</Badge>
          </span>
        }
        actions={
          <>
            <Button variant="outline" size="sm" icon={<Star size={14} />}>
              Watch
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<ExternalLink size={14} />}
              onClick={() =>
                window.open(`https://github.com/${repo.id}`, "_blank", "noopener")
              }
            >
              Open on GitHub
            </Button>
          </>
        }
      />

      <RepoStatsRow repo={repo} />

      <CommitHeatmap repo={repo} />

      <MergeTimeDistribution repo={repo} />

      <ContributorLeaderboard repoId={repo.id} initialTop={repo.top} />
    </div>
  );
}

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
function RepoStatsRow({ repo }: { repo: RepoStats }) {
  const stats: [string, string][] = [
    ["Stars", repo.stars],
    ["Forks", repo.forks],
    ["Open PRs", repo.openPrs],
    ["Open issues", repo.issues.d],
    ["Contributors", repo.contrib.d],
    ["Commits / week", repo.commits.d],
  ];

  return (
    <Card className="flex items-stretch overflow-hidden">
      {stats.map(([label, value], i) => (
        <div
          key={label}
          className={`flex flex-1 flex-col gap-1.5 px-5 py-4 ${
            i === 0 ? "" : "border-l border-slate-200 dark:border-slate-800"
          }`}
        >
          <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
          <span className="text-xl font-semibold tracking-tight tabular-nums text-slate-950 dark:text-white">
            {value}
          </span>
        </div>
      ))}
    </Card>
  );
}

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
function ContributorLeaderboard({
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
    <Card className="p-6">
      <div className="mb-3 flex items-start justify-between gap-4">
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
      <DataTable columns={contributorColumns} data={sorted} getRowId={(r) => r.login} />
    </Card>
  );
}
