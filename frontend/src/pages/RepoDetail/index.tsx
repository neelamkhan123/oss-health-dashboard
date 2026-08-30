import { useParams } from "react-router-dom";
import { Badge, Button, EmptyState, Skeleton } from "@neelamkhan21/ui";
import { ExternalLink, TriangleAlert } from "lucide-react";
import { PageHeader } from "../../layout/PageHeader";
import { CommitHeatmap } from "../../components/CommitHeatmap";
import { LanguageChart } from "../../components/LanguageChart";
import { MergeTimeDistribution } from "../../components/MergeTimeDistribution";
import { fetchRepoFull } from "../../lib/api";
import { useFetch } from "../../lib/useFetch";
import { useDateRange } from "../../lib/dateRangeContext";
import { useSyncStatus } from "../../lib/syncContext";
import { RepoStatsRow } from "./RepoStatsRow";
import { ContributorLeaderboard } from "./ContributorLeaderboard";
import { WatchButton } from "./WatchButton";

export function RepoDetail() {
  const { repoId } = useParams();
  const { days } = useDateRange();
  const { version } = useSyncStatus();
  const { isLoading, isError, data: repo, retry } = useFetch(
    `${repoId ?? ""}:${days}:${version}`,
    () => fetchRepoFull(repoId!, days),
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
            <WatchButton repoId={repo.id} />
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

      {/* lg:flex-row once there's room for both side by side; stacked below
       * that. 2:1 rather than an even split because the heatmap needs ~780px
       * to show all 53 weeks and a full year of month labels — anything
       * narrower and the last months scroll out of view — while the pie and
       * its legend are comfortable in a third of the row.
       * min-w-0 on both: without it, a flex item's default min-width is its
       * content size, which would stop CommitHeatmap's own overflow-x-auto
       * from ever kicking in and blow out the row instead of scrolling. */}
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 lg:flex-2">
          <CommitHeatmap repo={repo} />
        </div>
        <div className="min-w-0 lg:flex-1">
          <LanguageChart repo={repo} />
        </div>
      </div>

      <MergeTimeDistribution repo={repo} />

      <ContributorLeaderboard
        repoId={repo.id}
        initialTop={repo.top}
        topThisMonth={repo.topThisMonth}
      />
    </div>
  );
}
