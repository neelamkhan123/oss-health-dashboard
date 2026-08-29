// The last-resort list the Sidebar and Compare page render before the real
// tracked-repos fetch resolves — see lib/trackedReposContext.tsx, which is
// the actual source of truth (GET /api/dashboard/repos, backed by whatever
// rows exist in the `repos` table). Also what the backend's sync_all_repos
// seeds a brand-new, empty database with — see sync.py's own TRACKED_REPOS.
// Kept identical to that so a fresh clone's first paint isn't empty while
// it also happens to match what's about to actually get synced.
export const TRACKED_REPOS_FALLBACK = ["facebook/react", "vuejs/core", "microsoft/vscode"];
