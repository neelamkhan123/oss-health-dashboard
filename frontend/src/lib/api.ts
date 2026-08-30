import type {
  OverviewResponse,
  RepoStats,
  ContributorRow,
  SyncStatus,
  CurrentUser,
  TrackedRepo,
} from "./types";

const API_URL = import.meta.env.VITE_API_URL;

/** Real aggregation over real rows — slower than a cache hit, especially
 *  cold, but still a bounded local request. 8s gives it room without
 *  reintroducing the hang-forever failure mode a missing timeout caused
 *  earlier (a container port that accepts a connection and never answers
 *  leaves an un-timed-out fetch pending for the life of the page). */
const TIMEOUT_MS = 8000;

/** Every request goes cross-origin (5173 -> 8000 in dev), and `/api/dashboard`
 *  now sits behind `get_current_user` (Part 11) same as `/api/auth` always
 *  has — so every call needs the session cookie riding along explicitly.
 *  Fetch never sends cookies cross-origin on its own; omitting this turns
 *  every request here into a 401 regardless of whether the user is signed
 *  in. */
const CREDS: RequestCredentials = "include";

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { credentials: CREDS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status}`);
  }
  return res.json();
}

/** Fire-and-forget: the response only confirms the sync was queued, not
 *  that it finished — see the backend endpoint's own docstring. */
async function postJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    credentials: CREDS,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status}`);
  }
  return res.json();
}

/** `days` mirrors the Topbar's date-range picker — omitted, the backend
 *  falls back to its own 90-day default. */
export function fetchOverview(days?: number): Promise<OverviewResponse> {
  return getJSON<OverviewResponse>(`/dashboard/overview${days ? `?days=${days}` : ""}`);
}

export function fetchRepoFull(repoFullName: string, days?: number): Promise<RepoStats> {
  return getJSON<RepoStats>(
    `/dashboard/repos/${encodeURIComponent(repoFullName)}/full${days ? `?days=${days}` : ""}`,
  );
}

/** Queues an immediate sync of every tracked repo (the same job the
 *  backend's Celery beat schedule runs every 15 minutes) — see
 *  `POST /api/dashboard/sync`'s own docstring for why this doesn't wait
 *  for the sync to actually finish. */
export function triggerSync(): Promise<{ status: string; taskId: string }> {
  return postJSON("/dashboard/sync");
}

/** Polled by the Sync provider (see lib/syncContext.tsx) while a sync is
 *  in flight, to drive the progress toast. */
export function fetchSyncStatus(): Promise<SyncStatus> {
  return getJSON<SyncStatus>("/dashboard/sync/status");
}

/** The progress toast's Stop button. Best-effort — see the backend
 *  endpoint's own docstring for what "stopping" actually guarantees. */
export function stopSync(): Promise<{ cancelled: string[] }> {
  return postJSON("/dashboard/sync/stop");
}

/** The tracked-repo list — the Sidebar and Compare page's source of truth
 *  (see lib/trackedReposContext.tsx), not the hardcoded fallback in
 *  lib/constants.ts. */
export function fetchTrackedRepos(): Promise<TrackedRepo[]> {
  return getJSON("/dashboard/repos");
}

/** The "Add repository" dialog's submit. Not fire-and-forget like
 *  `postJSON`'s other callers: a bad name, an already-tracked repo, or one
 *  that doesn't exist on GitHub all come back as a specific error message
 *  (the backend's `HTTPException(detail=...)`) rather than a bare status
 *  code, since the dialog needs to show the user *why* it failed. */
export async function addTrackedRepo(fullName: string): Promise<TrackedRepo> {
  const res = await fetch(`${API_URL}/dashboard/repos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName }),
    credentials: CREDS,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.detail || `/dashboard/repos -> ${res.status}`);
  }
  return body;
}

/** The sidebar context menu's Remove. Untracks the repo for the signed-in
 *  user only — the backend keeps the shared Repo row and its synced history
 *  (see the endpoint's own docstring), so re-adding it later is instant
 *  rather than a fresh sync. Same specific-error handling as
 *  addTrackedRepo: "isn't in your tracked repositories" is worth showing. */
export async function removeTrackedRepo(fullName: string): Promise<{ removed: boolean }> {
  return repoRequest(fullName, "DELETE");
}

/** The sidebar context menu's Pin/Unpin — a per-user ordering preference,
 *  not a change to any repo's data. */
export async function setRepoPinned(fullName: string, pinned: boolean): Promise<TrackedRepo> {
  return repoRequest(fullName, "PATCH", { pinned });
}

/** Shared by removeTrackedRepo/setRepoPinned above, both of which address
 *  one already-tracked repo and can fail with a `detail` worth surfacing —
 *  the same shape watchRequest already uses for its own pair. */
async function repoRequest<T>(fullName: string, method: "DELETE" | "PATCH", body?: unknown): Promise<T> {
  const path = `/dashboard/repos/${encodeURIComponent(fullName)}`;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: CREDS,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const responseBody = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(responseBody?.detail || `${path} -> ${res.status}`);
  }
  return responseBody;
}

/** Whether GITHUB_TOKEN's own account is currently watching this repo on
 *  GitHub — see the backend endpoint's own docstring for why this is a
 *  live GitHub call rather than anything cached. */
export function fetchWatchStatus(repoFullName: string): Promise<{ watching: boolean }> {
  return getJSON(`/dashboard/repos/${encodeURIComponent(repoFullName)}/watch`);
}

/** Shared by watchRepo/unwatchRepo below: both can fail with a specific,
 *  worth-showing reason (most notably a 403 — GITHUB_TOKEN lacking
 *  permission to watch repos on GitHub's behalf), same reasoning as
 *  addTrackedRepo's own error handling above. */
async function watchRequest(repoFullName: string, method: "PUT" | "DELETE"): Promise<{ watching: boolean }> {
  const path = `/dashboard/repos/${encodeURIComponent(repoFullName)}/watch`;
  const res = await fetch(`${API_URL}${path}`, { method, credentials: CREDS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.detail || `${path} -> ${res.status}`);
  }
  return body;
}

export function watchRepo(repoFullName: string): Promise<{ watching: boolean }> {
  return watchRequest(repoFullName, "PUT");
}

export function unwatchRepo(repoFullName: string): Promise<{ watching: boolean }> {
  return watchRequest(repoFullName, "DELETE");
}

type ContributorsResponse = {
  username: string;
  avatarUrl: string | null;
  contributions: number;
  prsMerged: number;
  reviews: number;
  lastActive: string;
}[];

export async function fetchContributors(repoFullName: string): Promise<ContributorRow[]> {
  const data = await getJSON<ContributorsResponse>(
    `/dashboard/repos/${encodeURIComponent(repoFullName)}/contributors`,
  );
  return data.map((c) => ({
    login: c.username,
    commits: c.contributions,
    prs: c.prsMerged,
    reviews: c.reviews,
    last: c.lastActive,
  }));
}

// ── auth ─────────────────────────────────────────────────────────────────

/** Shared by signup/login/logout below: all three set or clear the session
 *  cookie as a side effect of the response headers (see set_session_cookie /
 *  clear_session_cookie on the backend), so the body is all a caller needs.
 *  Same reasoning as addTrackedRepo's error handling above — a bad password,
 *  a taken email, or "sign in with your password first" all come back as a
 *  specific `detail` the login/signup form needs to show, not a bare status
 *  code. */
async function authRequest<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: CREDS,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const responseBody = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(responseBody?.detail || `${path} -> ${res.status}`);
  }
  return responseBody;
}

export function signup(email: string, password: string): Promise<CurrentUser> {
  return authRequest("/auth/signup", { email, password });
}

export function login(email: string, password: string): Promise<CurrentUser> {
  return authRequest("/auth/login", { email, password });
}

export function logout(): Promise<{ ok: boolean }> {
  return authRequest("/auth/logout");
}

/** Who the session cookie belongs to, or a rejected promise on a 401 — the
 *  frontend's only way to ask, since it cannot read the httpOnly cookie
 *  itself. Call on app load to decide between the signed-in app and the
 *  login page. */
export function fetchMe(): Promise<CurrentUser> {
  return getJSON<CurrentUser>("/auth/me");
}

/** Not a fetch — a plain navigation target for the "Continue with
 *  GitHub/Google" buttons. `window.location.href = oauthLoginUrl("github")`
 *  hands the browser to the backend, which redirects it on to the provider;
 *  going through `fetch` here would follow the redirect chain in the
 *  background instead of taking the user's browser along with it. */
export function oauthLoginUrl(provider: "github" | "google"): string {
  return `${API_URL}/auth/${provider}/login`;
}
