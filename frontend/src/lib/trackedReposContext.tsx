import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { fetchTrackedRepos } from "./api";
import { useFetch } from "./useFetch";
import { TRACKED_REPOS_FALLBACK } from "./constants";
import type { TrackedRepo } from "./types";

type TrackedReposContextValue = {
  /** Full names ("owner/repo"), oldest first — matches the `repos` table's
   *  own insertion order, which is what keeps a repo's assigned palette
   *  color (repoColor indexes into this array) stable as more get added,
   *  rather than shifting every existing repo's color whenever the set
   *  changes. Deliberately NOT the sidebar's pinned-first order, which
   *  would shift half the palette the moment anything got pinned — see
   *  `sidebarRepos` for that. `TRACKED_REPOS_FALLBACK` until the first
   *  fetch resolves. */
  repoNames: string[];
  /** The same repos in the order the sidebar lists them: pinned first,
   *  each group still in add order. */
  sidebarRepos: TrackedRepo[];
  /** Bumped by `refresh()` — include it in a page's `useFetch` key
   *  (alongside `days`/the sync version) so adding a repo refetches
   *  whatever's currently on screen, the same pattern syncContext's
   *  `version` already establishes. */
  version: number;
  /** Called after "Add repository", a remove, or a pin toggle succeeds, to
   *  pick up the new list. */
  refresh: () => void;
};

const TrackedReposContext = createContext<TrackedReposContextValue | null>(null);

export function TrackedReposProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const { data } = useFetch(`tracked-repos:${version}`, fetchTrackedRepos);

  // The fallback's synthetic negative ids never collide with a real repo id
  // and are never sent anywhere — the sidebar keys off `fullName`, and this
  // list is replaced wholesale the moment the first fetch resolves.
  const repos = useMemo<TrackedRepo[]>(
    () =>
      data ??
      TRACKED_REPOS_FALLBACK.map((fullName, i) => ({ fullName, id: -(i + 1), pinned: false })),
    [data],
  );

  const repoNames = useMemo(() => repos.map((repo) => repo.fullName), [repos]);
  // Array#sort is specified as stable, so this only lifts the pinned repos
  // out — everything keeps its add order within its own group.
  const sidebarRepos = useMemo(
    () => [...repos].sort((a, b) => Number(b.pinned) - Number(a.pinned)),
    [repos],
  );

  const refresh = () => setVersion((v) => v + 1);
  const value = useMemo(
    () => ({ repoNames, sidebarRepos, version, refresh }),
    [repoNames, sidebarRepos, version],
  );

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
