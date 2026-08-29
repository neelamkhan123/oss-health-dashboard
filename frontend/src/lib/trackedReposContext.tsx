import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { fetchTrackedRepos } from "./api";
import { useFetch } from "./useFetch";
import { TRACKED_REPOS_FALLBACK } from "./constants";

type TrackedReposContextValue = {
  /** Full names ("owner/repo"), oldest first — matches the `repos` table's
   *  own insertion order, which is what keeps a repo's assigned palette
   *  color (repoColor indexes into this array) stable as more get added,
   *  rather than shifting every existing repo's color whenever the set
   *  changes. `TRACKED_REPOS_FALLBACK` until the first fetch resolves. */
  repoNames: string[];
  /** Bumped by `refresh()` — include it in a page's `useFetch` key
   *  (alongside `days`/the sync version) so adding a repo refetches
   *  whatever's currently on screen, the same pattern syncContext's
   *  `version` already establishes. */
  version: number;
  /** Called after "Add repository" succeeds, to pick up the new repo. */
  refresh: () => void;
};

const TrackedReposContext = createContext<TrackedReposContextValue | null>(null);

export function TrackedReposProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const { data } = useFetch(`tracked-repos:${version}`, fetchTrackedRepos);

  const repoNames = useMemo(() => data?.map((repo) => repo.fullName) ?? TRACKED_REPOS_FALLBACK, [data]);
  const refresh = () => setVersion((v) => v + 1);
  const value = useMemo(() => ({ repoNames, version, refresh }), [repoNames, version]);

  return <TrackedReposContext.Provider value={value}>{children}</TrackedReposContext.Provider>;
}

// See dateRangeContext.tsx's identical disable: a hook this small isn't
// worth splitting into its own file just to satisfy Fast Refresh.
// eslint-disable-next-line react-refresh/only-export-components
export function useTrackedRepos(): TrackedReposContextValue {
  const ctx = useContext(TrackedReposContext);
  if (!ctx) {
    throw new Error("useTrackedRepos must be used within a TrackedReposProvider");
  }
  return ctx;
}
