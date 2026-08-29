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
