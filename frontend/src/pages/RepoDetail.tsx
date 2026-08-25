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
import { CommitHeatmap } from "../components/CommitHeatmap";
import { MergeTimeDistribution } from "../components/MergeTimeDistribution";
import { mockRepo, type MockRepo, type MockContributor } from "../lib/mockData";

const API_URL = import.meta.env.VITE_API_URL;

export function RepoDetail() {
  const { repoId } = useParams();
  const repo = mockRepo(repoId);

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

      <ContributorLeaderboard repo={repo} />
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
function RepoStatsRow({ repo }: { repo: MockRepo }) {
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

const contributorColumns: DataTableColumn<MockContributor>[] = [
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
  // NaN is how a row sourced from the real endpoint says "the API has no
  // value for this column" — see ContributorLeaderboard. Rendered as an em
  // dash rather than the string "NaN".
  {
    key: "prs",
    header: "PRs merged",
    align: "right",
    sortable: true,
    cell: (row) => (Number.isFinite(row.prs) ? row.prs : "—"),
  },
  {
    key: "reviews",
    header: "Reviews",
    align: "right",
    sortable: true,
    cell: (row) => (Number.isFinite(row.reviews) ? row.reviews : "—"),
  },
  {
    key: "last",
    header: "Last active",
    align: "right",
    // Not sortable: these are pre-formatted relative strings ("2h ago",
    // "12d ago"), so sorting them would sort alphabetically and put "12d"
    // before "2h". Make it sortable once the API returns a real timestamp
    // to sort on.
    cell: (row) => (
      <span className="text-slate-500 dark:text-slate-400">{row.last}</span>
    ),
  },
];

function ContributorLeaderboard({ repo }: { repo: MockRepo }) {
  // Tagged with the repo it was fetched for, so navigating between two repos
  // can't show one repo's contributors under the other's heading while the
  // second fetch is in flight. Deriving the displayed rows from this is also
  // what keeps the effect from having to reset state on every repo change.
  const [fetched, setFetched] = useState<{
    repoId: string;
    rows: MockContributor[];
  } | null>(null);

  const rows = fetched?.repoId === repo.id ? fetched.rows : repo.top;

  useEffect(() => {
    // GET /repos/{id}/contributors is a real endpoint with a real shape, but
    // two things keep it from filling this table today:
    //
    //  1. It's routed on the integer Repo.id, while this page is routed on
    //     `owner/name` — so this call currently 422s on the path parameter.
    //     Fixing it properly means either a /repos/by-name/{owner}/{name}
    //     route or resolving the id first; both are backend work, out of
    //     scope for this pass.
    //  2. It returns `contributions` only. PRs merged, reviews and last
    //     active are three fields the sync doesn't collect at all (see
    //     mockData.ts), so real rows can fill two of five columns.
    //
    // Given that, real rows are merged in when they arrive — real login and
    // commit count, an em dash for what the API can't answer — rather than
    // being dropped or silently blended with invented numbers.
    // Bounded for the same reason as Overview's: a port that accepts and
    // never answers would otherwise leave this request pending for the life
    // of the page. Nothing here blocks rendering, but the leak is pointless.
    fetch(`${API_URL}/dashboard/repos/${encodeURIComponent(repo.id)}/contributors`, {
      signal: AbortSignal.timeout(4000),
    })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data: { username: string; contributions: number }[]) => {
        if (data.length === 0) return;
        setFetched({
          repoId: repo.id,
          rows: data.map((c) => ({
            login: c.username,
            commits: c.contributions,
            prs: NaN,
            reviews: NaN,
            last: "—",
          })),
        });
      })
      .catch(() => {
        // Placeholder rows are already in state — nothing to do.
      });
  }, [repo]);

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
            Sortable. Ranked by commits in the selected range.
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
