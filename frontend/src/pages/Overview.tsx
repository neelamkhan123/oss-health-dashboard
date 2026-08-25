import { useEffect, useState } from "react";
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
  type DataTableColumn,
} from "@neelamkhan21/ui";
import { Clock, CircleAlert, Users, TrendingUp, Inbox, Folder, Plus } from "lucide-react";
import { TrendChartCard, type TrendMetric } from "../components/TrendChartCard";
import {
  MOCK_REPOS,
  MOCK_OVERVIEW_STATS,
  type MockRepo,
} from "../lib/mockData";

const API_URL = import.meta.env.VITE_API_URL;

type Status = "loading" | "ready" | "empty";

export function Overview() {
  const [status, setStatus] = useState<Status>("loading");
  const [metric, setMetric] = useState<TrendMetric>("merge");

  useEffect(() => {
    // GET /api/dashboard/overview is still the Part 9.6 stub: it returns one
    // row per synced repo with every metric hard-coded to 0 and every KPI to
    // "—", and an empty `trend`. So it can tell us one useful thing — whether
    // anything has been synced at all — and nothing else. That's what it's
    // used for here; the numbers below come from the placeholder dataset.
    //
    // Note this page now needs several fields the endpoint has no source for
    // at all (first-response time, merge rate, status) — see the gap notes at
    // the top of mockData.ts. Rendering `json` directly once the stub grows
    // real numbers will still leave those columns empty, so treat the swap as
    // "read what exists, keep the placeholder for the rest" rather than a
    // one-line substitution.
    // The timeout is doing real work, not being defensive for its own sake:
    // a refused connection rejects immediately, but a port that *accepts*
    // and then never answers (a container proxy holding 8000 open while the
    // app behind it is down — the normal state of a half-started docker
    // compose) leaves this promise pending forever, and with it the loading
    // skeleton. An unbounded wait for a backend the page can already render
    // without is the wrong trade.
    fetch(`${API_URL}/dashboard/overview`, { signal: AbortSignal.timeout(4000) })
      .then((res) => res.json())
      .then((json) => setStatus(json.repos.length === 0 ? "empty" : "ready"))
      // No backend running, CORS misconfigured, request timed out — show the
      // placeholder dashboard rather than staying on the skeleton.
      .catch(() => setStatus("ready"));
  }, []);

  if (status === "loading") return <OverviewSkeleton />;
  if (status === "empty") return <OverviewEmpty onConnect={() => setStatus("ready")} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <StatCard
          label="Avg. time to merge"
          value={MOCK_OVERVIEW_STATS.avgMergeTime.value}
          delta={MOCK_OVERVIEW_STATS.avgMergeTime.delta}
          deltaLabel={MOCK_OVERVIEW_STATS.avgMergeTime.deltaLabel}
          deltaDirection="down-is-good"
          trend={MOCK_OVERVIEW_STATS.avgMergeTime.sparkline}
          icon={<Clock size={16} />}
        />
        <StatCard
          label="Open issues"
          value={MOCK_OVERVIEW_STATS.openIssues.value}
          delta={MOCK_OVERVIEW_STATS.openIssues.delta}
          deltaLabel={MOCK_OVERVIEW_STATS.openIssues.deltaLabel}
          deltaDirection="down-is-good"
          trend={MOCK_OVERVIEW_STATS.openIssues.sparkline}
          icon={<CircleAlert size={16} />}
        />
        <StatCard
          label="Contributors, 90 days"
          value={MOCK_OVERVIEW_STATS.contributors.value}
          delta={MOCK_OVERVIEW_STATS.contributors.delta}
          deltaLabel={MOCK_OVERVIEW_STATS.contributors.deltaLabel}
          trend={MOCK_OVERVIEW_STATS.contributors.sparkline}
          icon={<Users size={16} />}
        />
        <StatCard
          label="PRs merged this week"
          value={MOCK_OVERVIEW_STATS.prsThisWeek.value}
          delta={MOCK_OVERVIEW_STATS.prsThisWeek.delta}
          deltaLabel={MOCK_OVERVIEW_STATS.prsThisWeek.deltaLabel}
          trend={MOCK_OVERVIEW_STATS.prsThisWeek.sparkline}
          icon={<TrendingUp size={16} />}
        />
      </div>

      <TrendChartCard repos={MOCK_REPOS} metric={metric} onMetricChange={setMetric} />

      <TrackedRepositories />
    </div>
  );
}

function TrackedRepositories() {
  const navigate = useNavigate();

  const columns: DataTableColumn<MockRepo>[] = [
    {
      key: "id",
      header: "Repository",
      cell: (repo) => (
        <a
          href={`/repos/${encodeURIComponent(repo.id)}`}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            navigate(`/repos/${encodeURIComponent(repo.id)}`);
          }}
          className="flex items-center gap-2 font-medium text-slate-950 hover:underline dark:text-white"
        >
          <Folder size={14} aria-hidden="true" />
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
      // Every metric column displays a formatted string but sorts on the raw
      // number behind it — otherwise "1,043" would sort before "612".
      sortValue: (repo) => repo.merge.v,
      cell: (repo) => repo.merge.d,
      filterValue: (repo) => repo.merge.d,
    },
    {
      key: "response",
      header: "First response",
      align: "right",
      sortable: true,
      sortValue: (repo) => repo.response.v,
      cell: (repo) => repo.response.d,
      filterValue: (repo) => repo.response.d,
    },
    {
      key: "issues",
      header: "Open issues",
      align: "right",
      sortable: true,
      sortValue: (repo) => repo.issues.v,
      cell: (repo) => repo.issues.d,
      filterValue: (repo) => repo.issues.d,
    },
    {
      key: "contrib",
      header: "Contributors",
      align: "right",
      sortable: true,
      sortValue: (repo) => repo.contrib.v,
      cell: (repo) => repo.contrib.d,
      filterValue: (repo) => repo.contrib.d,
    },
    {
      key: "mergeRate",
      header: "Merge rate",
      align: "right",
      sortable: true,
      sortValue: (repo) => repo.mergeRate.v,
      cell: (repo) => repo.mergeRate.d,
      filterValue: (repo) => repo.mergeRate.d,
    },
    {
      key: "spark",
      header: "90-day trend",
      cell: (repo) => (
        <Sparkline data={repo.spark} className="h-8 w-24" style={{ color: repo.color }} />
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
  const rows = [...MOCK_REPOS].sort((a, b) => a.merge.v - b.merge.v);

  return (
    <Card className="p-6">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="m-0 text-sm font-semibold text-slate-950 dark:text-white">
            Tracked repositories
          </h2>
          <p className="m-0 text-xs text-slate-500 dark:text-slate-400">
            Last 90 days. Click a repository for the full breakdown.
          </p>
        </div>
        {/* Disabled rather than a no-op: there is no "add a repository"
         * endpoint, and the tracked list is a hard-coded constant shared
         * with the backend's sync job (see lib/constants.ts), so a working
         * button here would need that list to become real data first. */}
        <Button variant="ghost" size="sm" icon={<Plus size={14} />} disabled>
          Add repository
        </Button>
      </div>
      <DataTable columns={columns} data={rows} getRowId={(repo) => repo.id} />
    </Card>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <Skeleton className="size-3.5 rounded-full" />
        <span>Syncing repositories from the GitHub API</span>
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
      <Card className="flex flex-col gap-5 p-6">
        <Skeleton className="h-4 w-45" />
        <Skeleton className="h-62 w-full" />
      </Card>
      <Card className="flex flex-col gap-3.5 p-6">
        <Skeleton className="h-4 w-55" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </Card>
    </div>
  );
}

function OverviewEmpty({ onConnect }: { onConnect: () => void }) {
  const steps = [
    ["1. Connect GitHub", "Read-only access to public repository metadata."],
    ["2. Pick repositories", "Up to 25 repositories per workspace."],
    [
      "3. Wait for the first sync",
      "Around four minutes for a repository the size of react.",
    ],
  ];

  return (
    <div className="flex flex-col gap-6">
      <EmptyState
        icon={<Inbox size={20} />}
        title="No repositories synced yet"
        description="Connect a GitHub account and pick the repositories you want to track. The first sync pulls 90 days of pull requests, issues and commits."
        action={
          // No OAuth flow exists yet, so this stands in for one by revealing
          // the placeholder dashboard — enough to review the layout behind
          // the empty state without pretending a connection was made.
          <Button size="sm" onClick={onConnect}>
            Connect GitHub
          </Button>
        }
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
