import { useState } from "react";
import { Toggle } from "@neelamkhan21/ui";

const TRACKED_REPOS = ["facebook/react", "vuejs/core", "microsoft/vscode"];

export function Compare() {
  const [selected, setSelected] = useState<string[]>(TRACKED_REPOS);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {TRACKED_REPOS.map((repo) => (
          <Toggle
            key={repo}
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
        }}
      >
        {/* Fetch per-repo stats for `selected` and render a StatCard each —
            same fetch pattern as RepoDetail, called once per selected repo. */}
      </div>

      {/* Comparison table + overlaid trend chart — build once the StatCard
          row above is working; both reuse components you'll have already
          built for Overview and Repo Detail by this point. */}
    </div>
  );
}
