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
  type DataTableColumn,
} from "@neelamkhan21/ui";
import { Star, ExternalLink } from "lucide-react";
import { PageHeader } from "../layout/PageHeader";

const API_URL = import.meta.env.VITE_API_URL;

export function RepoDetail() {
  const { repoId } = useParams();
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    // This is the SAME endpoint from Part 8/11 — your optimized,
    // performance-measured single-repo stats call.
    fetch(`${API_URL}/dashboard/repos/${encodeURIComponent(repoId!)}/stats`)
      .then((res) => res.json())
      .then(setStats);
  }, [repoId]);

  if (!stats) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={repoId ?? "Repository"} />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Loading…
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={stats.repo}
        description={
          <span className="flex items-center gap-2">
            <Badge variant="secondary">JavaScript</Badge>
            <Badge variant="outline">MIT license</Badge>
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
            >
              Open on GitHub
            </Button>
          </>
        }
      />

      <p className="text-sm text-slate-600 dark:text-slate-300">
        Avg. merge time: {stats.avg_merge_time_hours}h · Total PRs:{" "}
        {stats.total_prs}
      </p>

      {/* Commit heatmap, PR distribution chart, and percentiles are the
          next three sections to add — each needs its own backend field
          (a per-day commit count array, a merge-time bucket histogram,
          and p50/p75/p90/p95 values respectively). Build one at a time,
          same pattern as the Overview endpoint above: stub the shape,
          wire the UI, then fill in the real query. */}

      <ContributorLeaderboard repoId={repoId!} />
    </div>
  );
}

type ContributorRow = {
  username: string;
  avatarUrl: string;
  contributions: number;
};

const contributorColumns: DataTableColumn<ContributorRow>[] = [
  { key: "username", header: "Contributor" },
  { key: "contributions", header: "Commits", align: "right", sortable: true },
];

function ContributorLeaderboard({ repoId }: { repoId: string }) {
  const [contributors, setContributors] = useState<ContributorRow[]>([]);

  useEffect(() => {
    fetch(
      `${API_URL}/dashboard/repos/${encodeURIComponent(repoId)}/contributors`,
    )
      .then((res) => res.json())
      .then(setContributors);
  }, [repoId]);

  // DataTable has no "default sort" prop (sorting is click-to-sort only) —
  // pre-sort the rows we hand it instead, matching the old default of
  // descending by commit count.
  const sortedContributors = [...contributors].sort(
    (a, b) => b.contributions - a.contributions,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-lg font-semibold tracking-tight text-slate-950 dark:text-white">
          Contributor leaderboard
        </h2>
        <AvatarGroup label="Top contributors" size="sm" max={5}>
          {contributors.slice(0, 5).map((c) => (
            <Avatar key={c.username}>
              <AvatarFallback>
                {c.username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ))}
        </AvatarGroup>
      </div>
      <Card className="p-1">
        <DataTable
          columns={contributorColumns}
          data={sortedContributors}
          getRowId={(r) => r.username}
        />
      </Card>
    </div>
  );
}
