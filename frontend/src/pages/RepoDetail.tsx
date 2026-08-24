import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  DataTable,
  AvatarGroup,
  Avatar,
  type DataTableColumn,
} from "@neelamkhan21/ui";
import { Star, ExternalLink } from "lucide-react";

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

  if (!stats) return <p>Loading…</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <h1>{stats.repo}</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <Badge variant="secondary">JavaScript</Badge>
            <Badge variant="outline">MIT license</Badge>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="outline" size="sm" icon={<Star size={14} />}>
            Watch
          </Button>
          <Button variant="outline" size="sm" icon={<ExternalLink size={14} />}>
            Open on GitHub
          </Button>
        </div>
      </div>

      <p>
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
    <div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h2>Contributor leaderboard</h2>
        <AvatarGroup label="Top contributors" size="sm" max={5}>
          {contributors.slice(0, 5).map((c) => (
            <Avatar key={c.username}>
              {c.username.slice(0, 2).toUpperCase()}
            </Avatar>
          ))}
        </AvatarGroup>
      </div>
      <DataTable
        columns={contributorColumns}
        data={sortedContributors}
        getRowId={(r) => r.username}
      />
    </div>
  );
}
