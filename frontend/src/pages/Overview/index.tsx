import { StatCard } from "@neelamkhan21/ui";
import { Clock, CircleAlert, Users, TrendingUp } from "lucide-react";
import { fetchOverview } from "../../lib/api";
import { useFetch } from "../../lib/useFetch";
import { useDateRange } from "../../lib/dateRangeContext";
import { useSyncStatus } from "../../lib/syncContext";
import { useTrackedRepos } from "../../lib/trackedReposContext";
import { TrackedRepositories } from "./TrackedRepositories";
import { AddRepositoryInline } from "./AddRepositoryInline";
import { OverviewSkeleton } from "./OverviewSkeleton";
import { OverviewEmpty } from "./OverviewEmpty";
import { OverviewError } from "./OverviewError";

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
      <div className="flex flex-col gap-1.5">
        {/* TODO: Replace hardcoded name with dynamic user name */}
        <h1 className="m-0 text-2xl leading-tight font-semibold tracking-tight text-slate-950 dark:text-white">
          Welcome back, Neelam
        </h1>
        <p className="m-0 text-xs text-slate-500 dark:text-slate-400">
          Here's an overview of your repositories and key metrics for the past{" "}
          {days} days.
        </p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
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
