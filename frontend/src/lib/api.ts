import type { OverviewResponse, RepoStats, ContributorRow } from "./types";

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

export function fetchOverview(): Promise<OverviewResponse> {
  return getJSON<OverviewResponse>("/dashboard/overview");
}

export function fetchRepoFull(repoFullName: string): Promise<RepoStats> {
  return getJSON<RepoStats>(`/dashboard/repos/${encodeURIComponent(repoFullName)}/full`);
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
