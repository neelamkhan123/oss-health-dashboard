import type { OverviewResponse, RepoStats, ContributorRow, SyncStatus } from "./types";

const API_URL = import.meta.env.VITE_API_URL;

/** Real aggregation over real rows — slower than a cache hit, especially
 *  cold, but still a bounded local request. 8s gives it room without
 *  reintroducing the hang-forever failure mode a missing timeout caused
 *  earlier (a container port that accepts a connection and never answers
 *  leaves an un-timed-out fetch pending for the life of the page). */
const TIMEOUT_MS = 8000;

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
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
export function fetchTrackedRepos(): Promise<{ fullName: string; id: number }[]> {
  return getJSON("/dashboard/repos");
}

/** The "Add repository" dialog's submit. Not fire-and-forget like
 *  `postJSON`'s other callers: a bad name, an already-tracked repo, or one
 *  that doesn't exist on GitHub all come back as a specific error message
 *  (the backend's `HTTPException(detail=...)`) rather than a bare status
 *  code, since the dialog needs to show the user *why* it failed. */
export async function addTrackedRepo(fullName: string): Promise<{ fullName: string; id: number }> {
  const res = await fetch(`${API_URL}/dashboard/repos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.detail || `/dashboard/repos -> ${res.status}`);
  }
  return body;
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
  const res = await fetch(`${API_URL}${path}`, { method, signal: AbortSignal.timeout(TIMEOUT_MS) });
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
