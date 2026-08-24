import { useState } from "react";
import { Toggle, EmptyState } from "@neelamkhan21/ui";
import { Layers } from "lucide-react";
import { PageHeader } from "../layout/PageHeader";

const TRACKED_REPOS = ["facebook/react", "vuejs/core", "microsoft/vscode"];

export function Compare() {
  const [selected, setSelected] = useState<string[]>(TRACKED_REPOS);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Compare"
        description="Pick two or more tracked repositories to compare side by side."
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {TRACKED_REPOS.map((repo) => (
          <Toggle
            key={repo}
            variant="outline"
            pressed={selected.includes(repo)}
            onPressedChange={(pressed: boolean) =>
              setSelected((prev) =>
                pressed ? [...prev, repo] : prev.filter((r) => r !== repo),
              )
            }
          >
            {repo.split("/")[1]}
          </Toggle>
        ))}
      </div>

      {selected.length === 0 ? (
        <EmptyState
          icon={<Layers size={32} />}
          title="No repositories selected"
          description="Choose at least two repositories above to compare them."
          live
        />
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
            {/* Fetch per-repo stats for `selected` and render a StatCard each —
                same fetch pattern as RepoDetail, called once per selected repo. */}
          </div>

          {/* Comparison table + overlaid trend chart — build once the StatCard
              row above is working; both reuse components already built for
              Overview and Repo Detail. */}
        </>
      )}
    </div>
  );
}
