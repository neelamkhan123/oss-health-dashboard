import { useParams } from "react-router-dom";
import { Badge, Button, EmptyState, Skeleton } from "@neelamkhan21/ui";
import { ExternalLink, TriangleAlert } from "lucide-react";
import { PageHeader } from "../../layout/PageHeader";
import { CommitHeatmap } from "../../components/CommitHeatmap";
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

      <CommitHeatmap repo={repo} />

      <MergeTimeDistribution repo={repo} />

      <ContributorLeaderboard
        repoId={repo.id}
        initialTop={repo.top}
        topThisMonth={repo.topThisMonth}
      />
    </div>
  );
}
