// The curated repo list — mirrors backend/app/services/sync.py's
// TRACKED_REPOS. Duplicated here (not fetched) because the sidebar and the
// Compare toggles need it before any API call resolves. If this ever drifts
// from the backend list, add a GET /api/dashboard/repos endpoint instead of
// hand-syncing two lists.
export const TRACKED_REPOS = ["facebook/react", "vuejs/core", "microsoft/vscode"];
