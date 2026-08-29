import { useNavigate } from "react-router-dom";
import { Badge, Sparkline, type DataTableColumn } from "@neelamkhan21/ui";
import { Folder } from "lucide-react";
import { StyledDataTable } from "../../components/StyledDataTable";
import { repoColor } from "../../lib/types";
import type { RepoStats } from "../../lib/types";

export function TrackedRepositories({
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

  return <StyledDataTable columns={columns} data={rows} getRowId={(repo) => repo.id} />;
}
