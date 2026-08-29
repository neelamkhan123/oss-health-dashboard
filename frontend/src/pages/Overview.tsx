import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  StatCard,
  DataTable,
  Skeleton,
  EmptyState,
  Card,
  Badge,
  Button,
  Sparkline,
  Input,
  toast,
  type DataTableColumn,
} from "@neelamkhan21/ui";
import {
  Clock,
  CircleAlert,
  Users,
  TrendingUp,
  Inbox,
  Folder,
  TriangleAlert,
} from "lucide-react";
import { fetchOverview, addTrackedRepo } from "../lib/api";
import { repoColor } from "../lib/types";
import { useFetch } from "../lib/useFetch";
import { useDateRange } from "../lib/dateRangeContext";
import { useSyncStatus } from "../lib/syncContext";
import { useTrackedRepos } from "../lib/trackedReposContext";
import type { RepoStats } from "../lib/types";

export function Overview() {
  const { days } = useDateRange();
  const { version: syncVersion } = useSyncStatus();
  const { repoNames, version: trackedVersion } = useTrackedRepos();
  // `days`, `syncVersion`, and `trackedVersion` in the key, not just the
  // fetcher: useFetch refetches when its key changes, so the Topbar's
  // date-range picker driving `days`, a sync completing, or a repo being
  // added are all what actually reload this page's data.
  const { isLoading, isError, data, retry } = useFetch(
    `overview:${days}:${syncVersion}:${trackedVersion}`,
    () => fetchOverview(days),
  );

  if (isLoading) return <OverviewSkeleton />;
  if (isError || !data) return <OverviewError onRetry={retry} />;
  if (data.repos.length === 0 || !data.kpis) return <OverviewEmpty />;

  const { repos, kpis } = data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col px-2">
        {/* TODO: Replace hardcoded name with dynamic user name */}
        <h1 className="text-2xl font-bold">Welcome back, Neelam</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Here's an overview of your repositories and key metrics for the past{" "}
          {days} days.
        </p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <StatCard
          label="Avg. time to merge"
          value={kpis.avgMergeTime.value}
          delta={kpis.avgMergeTime.delta}
          deltaLabel={kpis.avgMergeTime.deltaLabel}
          deltaDirection="down-is-good"
          trend={kpis.avgMergeTime.sparkline}
          icon={<Clock size={16} />}
        />
        <StatCard
          label="Open issues"
          value={kpis.openIssues.value}
          delta={kpis.openIssues.delta}
          deltaLabel={kpis.openIssues.deltaLabel}
          deltaDirection="down-is-good"
          trend={kpis.openIssues.sparkline}
          icon={<CircleAlert size={16} />}
        />
        <StatCard
          label={`Contributors, ${days} days`}
          value={kpis.contributors.value}
          delta={kpis.contributors.delta}
          deltaLabel={kpis.contributors.deltaLabel}
          trend={kpis.contributors.sparkline}
          icon={<Users size={16} />}
        />
        <StatCard
          label="PRs merged this week"
          value={kpis.prsThisWeek.value}
          delta={kpis.prsThisWeek.delta}
          deltaLabel={kpis.prsThisWeek.deltaLabel}
          trend={kpis.prsThisWeek.sparkline}
          icon={<TrendingUp size={16} />}
        />
      </div>

      <AddRepositoryInline />

      <TrackedRepositories repos={repos} trackedRepoNames={repoNames} />
    </div>
  );
}

function TrackedRepositories({
  repos,
  trackedRepoNames,
}: {
  repos: RepoStats[];
  trackedRepoNames: string[];
}) {
  const navigate = useNavigate();

  const columns: DataTableColumn<RepoStats>[] = [
    {
      key: "id",
      header: "Repository",
      cell: (repo) => (
        <a
          href={`/repos/${encodeURIComponent(repo.id)}`}
          onClick={(e) => {
            if (
              e.metaKey ||
              e.ctrlKey ||
              e.shiftKey ||
              e.altKey ||
              e.button !== 0
            )
              return;
            e.preventDefault();
            navigate(`/repos/${encodeURIComponent(repo.id)}`);
          }}
          className="flex items-center gap-2 font-medium text-slate-950 hover:underline dark:text-white"
        >
          <Folder
            size={14}
            aria-hidden="true"
            className="text-blue-300 fill-blue-300"
          />
          {repo.id}
        </a>
      ),
      sortable: true,
    },
    {
      key: "merge",
      header: "Avg. merge time",
      align: "right",
      sortable: true,
      sortValue: (repo) => repo.merge.v ?? 0,
      cell: (repo) => repo.merge.d,
      filterValue: (repo) => repo.merge.d,
    },
    {
      key: "response",
      header: "First response",
      align: "right",
      sortable: true,
      sortValue: (repo) => repo.response.v ?? 0,
      cell: (repo) => repo.response.d,
      filterValue: (repo) => repo.response.d,
    },
    {
      key: "issues",
      header: "Open issues",
      align: "right",
      sortable: true,
      sortValue: (repo) => repo.issues.v ?? 0,
      cell: (repo) => repo.issues.d,
      filterValue: (repo) => repo.issues.d,
    },
    {
      key: "contrib",
      header: "Contributors",
      align: "right",
      sortable: true,
      sortValue: (repo) => repo.contrib.v ?? 0,
      cell: (repo) => repo.contrib.d,
      filterValue: (repo) => repo.contrib.d,
    },
    {
      key: "mergeRate",
      header: "Merge rate",
      align: "right",
      sortable: true,
      sortValue: (repo) => repo.mergeRate.v ?? 0,
      cell: (repo) => repo.mergeRate.d,
      filterValue: (repo) => repo.mergeRate.d,
    },
    {
      key: "spark",
      header: "90-day trend",
      cell: (repo) => (
        <Sparkline
          data={repo.spark}
          className="h-8 w-24"
          style={{ color: repoColor(repo.id, trackedRepoNames) }}
        />
      ),
      // A sparkline contributes no text to search, and its raw array would
      // match nonsense like "46,44".
      filterValue: () => "",
    },
    {
      key: "status",
      header: "Status",
      cell: (repo) => <Badge variant={repo.statusVariant}>{repo.status}</Badge>,
      filterValue: (repo) => repo.status,
    },
  ];

  // DataTable has no "default sort" prop (sorting is click-to-sort only) —
  // pre-sort the rows we hand it instead, fastest-merging repo first.
  const rows = [...repos].sort((a, b) => (a.merge.v ?? 0) - (b.merge.v ?? 0));

  return (
    // DataTable exposes no header-styling prop, and DataTableColumn's own
    // `className` reaches the body cells too (same field, both call
    // sites) — an arbitrary-variant descendant selector scoped to this
    // card is what actually hits only the header, without a
    // component-library change. It also naturally out-specifies
    // TableHead's own hardcoded `h-10 px-3` (a two-element compound
    // selector beats a single utility class on specificity), so this
    // wins regardless of which order Tailwind happens to emit either
    // rule in — no `!important` needed.
    //
    // `overflow-hidden`, not rounding the row/cells themselves: a <tr>'s
    // background doesn't reliably clip to a border-radius the way a
    // normal box does (that's why the header's square corners were
    // poking past the card's rounded edge), and rounding only the outer
    // header cells' corners individually is exactly the kind of
    // per-cell-fragile fix that breaks the next time a column is added
    // or reordered. Clipping the whole card to its own already-rounded
    // shape is the one fix that doesn't care what's inside it.
    <Card className="overflow-hidden [&_thead_th]:bg-slate-50 [&_thead_th]:py-3 dark:[&_thead_th]:bg-slate-900 [&_thead_th]:border-b [&_thead_th]:border-slate-200 dark:[&_thead_th]:border-slate-800">
      <DataTable columns={columns} data={rows} getRowId={(repo) => repo.id} />
    </Card>
  );
}

/**
 * Tracks a new public GitHub repo — its own row between the KPI cards and
 * the tracked-repositories table, not folded into either. No dialog: a
 * single field doesn't need a modal in the way, and there's room for it
 * directly on the page now that the trend chart (see git history) no
 * longer sits above the table. Its data starts syncing as soon as the
 * backend confirms the repo actually exists.
 */
function AddRepositoryInline() {
  const { refresh } = useTrackedRepos();
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = fullName.trim();
    if (!trimmed) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await addTrackedRepo(trimmed);
      toast({
        title: "Repository added",
        description: `${trimmed} is now tracked — syncing its data now.`,
        variant: "success",
      });
      refresh();
      setFullName("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't add this repository.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col flex-wrap gap-2">
      <div className="flex flex-col px-2">
        <h2 className="m-0 font-semibold text-slate-950 dark:text-white">
          Add a repository
        </h2>
        <p className="m-0 text-xs text-slate-500 dark:text-slate-400">
          Any public GitHub repository — starts syncing as soon as it's added.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex items-center gap-2 w-1/2">
        <Input
          aria-label="Repository to track (owner/repo)"
          placeholder="owner/repo"
          value={fullName}
          onChange={(e) => {
            setFullName(e.target.value);
            if (error) setError(null);
          }}
          className="h-8 text-xs"
        />
        <Button
          type="submit"
          size="md"
          loading={isSubmitting}
          disabled={!fullName.trim()}
        >
          Add
        </Button>
        {error ? (
          <p className="w-full text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <Skeleton className="size-3.5 rounded-full" />
        <span>Loading dashboard data</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="flex flex-col gap-4 p-5">
            <Skeleton className="h-3 w-28" />
            <div className="flex items-end justify-between gap-4">
              <Skeleton className="h-7 w-22" />
              <Skeleton className="h-8 w-24" />
            </div>
          </Card>
        ))}
      </div>
      <Card className="flex flex-col gap-3.5 p-6">
        <Skeleton className="h-4 w-55" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </Card>
    </div>
  );
}

function OverviewEmpty() {
  const steps = [
    [
      "1. Add a real GITHUB_TOKEN",
      "The sync job needs a Personal Access Token with public_repo scope in the backend's .env.",
    ],
    [
      "2. Trigger a sync",
      'docker compose exec api python -c "from app.services.sync import sync_all_repos; sync_all_repos.delay()"',
    ],
    [
      "3. Wait for it to finish",
      "A few minutes for a repo the size of react — check docker compose logs worker.",
    ],
  ];

  return (
    <div className="flex flex-col gap-6">
      <EmptyState
        icon={<Inbox size={20} />}
        title="No repositories synced yet"
        description="The tracked repos exist, but nothing has synced from GitHub yet — there's no mock data standing in for it anymore."
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        {steps.map(([title, description]) => (
          <Card key={title} className="flex flex-col gap-1.5 p-5">
            <span className="text-sm font-medium text-slate-950 dark:text-white">
              {title}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {description}
            </span>
          </Card>
        ))}
      </div>
    </div>
  );
}

function OverviewError({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={<TriangleAlert size={20} />}
      title="Couldn't load dashboard data"
      description="The API didn't respond — check that the backend (docker compose up) is running."
      action={
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      }
    />
  );
}
