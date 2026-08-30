/** A metric with its raw value (for sorting/comparison) and its display
 *  string, exactly as `GET /repos/{id}/full` returns it. `v` is `null`
 *  where the backend genuinely has no data yet (e.g. `response` before
 *  any issue first-response has been backfilled) — render `d` ("—") in
 *  that case rather than treating `null` as zero. */
export type MetricValue = { v: number | null; d: string };

/** As `POST /auth/signup|login` and `GET /auth/me` return it — see
 *  routers/auth.py's `serialize()`. `name`/`avatarUrl` are null for a
 *  password-only account that's never linked an OAuth provider. The session
 *  itself lives in an httpOnly cookie the frontend never reads directly —
 *  this is the only shape it ever sees a signed-in user in. */
export type CurrentUser = {
  id: number;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

/** One row of `GET /dashboard/repos` — this user's own link to a repo,
 *  not the repo itself. `pinned` is a per-user ordering preference the
 *  sidebar reads (see lib/trackedReposContext.tsx); nothing else about a
 *  repo's data changes with it. */
export type TrackedRepo = {
  fullName: string;
  id: number;
  pinned: boolean;
};

export type ContributorRow = {
  login: string;
  commits: number;
  prs: number;
  reviews: number;
  /** Relative, pre-formatted by the backend ("2h ago", "—" if never active). */
  last: string;
};

/** `Badge`'s variant vocabulary, narrowed to the ones a repo status uses. */
export type StatusVariant = "secondary" | "destructive" | "outline" | "default";

/** One repo's full stats, as `GET /repos/{id}/full` returns it (and as
 *  embedded in `GET /overview`'s `repos` array — same shape, same
 *  computation, so a repo's numbers can't disagree between pages). */
export type RepoStats = {
  id: string; // owner/name
  lang: string;
  /** Full breakdown by bytes of code, sorted descending — from
   *  GET /repos/{owner}/{name}/languages, distinct from `lang` above
   *  (linguist's single guess at the primary language). Empty for a repo
   *  that hasn't synced since this was added; render the `lang` badge
   *  alone in that case rather than an empty chart. */
  languages: { name: string; bytes: number; pct: number }[];
  license: string;
  stars: string;
  forks: string;
  openPrs: string;
  merge: MetricValue;
  response: MetricValue;
  issues: MetricValue;
  contrib: MetricValue;
  mergeRate: MetricValue;
  /** Commits per week. */
  commits: MetricValue;
  status: string;
  statusVariant: StatusVariant;
  /** 12 points, reused from trendMerge — see the backend's own note on why. */
  spark: number[];
  /** 12 monthly points — avg hours from PR open to merge. */
  trendMerge: number[];
  /** 12 monthly points — avg hours to first response (0 for months with none backfilled yet). */
  trendIssue: number[];
  /** Commits in the last 12 months, pre-formatted. */
  commitsTotal: string;
  /** Merged-PR counts per MERGE_TIME_BUCKETS entry, same order. */
  dist: number[];
  /** [label, value] pairs, value written as hours ("11h") or days ("2.1d"). */
  pct: [string, string][];
  top: ContributorRow[];
  /** Top 5 contributors by commit count in the trailing 30 days — a
   *  genuinely different ranking from `top` above (all-time contributions),
   *  not a slice of it. Backs the leaderboard's "Top this month" avatars. */
  topThisMonth: { login: string; commits: number }[];
  /** 53 weeks x 7 days of commit counts, oldest week first. */
  heatmap: number[][];
};

export type Kpi = {
  value: string;
  /** Signed ratio — 0.124 = a 12.4% rise. */
  delta: number;
  deltaLabel: string;
  sparkline: number[];
};

export type OverviewKpis = {
  avgMergeTime: Kpi;
  openIssues: Kpi;
  contributors: Kpi;
  prsThisWeek: Kpi;
};

export type OverviewResponse = {
  repos: RepoStats[];
  /** `null` when nothing has synced yet — no repos means no KPIs to compute. */
  kpis: OverviewKpis | null;
};

/** As `GET /dashboard/sync/status` returns it — see the backend endpoint's
 *  own docstring for what each `state` means. "cancelled" is what a repo's
 *  entry reads after the Stop button revokes its still-pending task. */
export type SyncStatus = {
  state: "idle" | "running" | "complete";
  startedAt: string | null;
  repos: Record<string, "pending" | "done" | "failed" | "cancelled" | "unknown">;
};

export const MERGE_TIME_BUCKETS = ["<1h", "1–6h", "6–24h", "1–3d", "3–7d", ">7d"];

/** The same trailing 12 calendar months `_month_boundaries` computes on the
 *  backend (oldest first, ending with the current month) — recomputed here
 *  rather than sent over the wire, so the two can't drift as long as both
 *  read "now" the same way. */
export function trailingMonths(count = 12): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toLocaleString("en-US", { month: "short" }));
  }
  return months;
}

/** The upper bound the percentile bars are drawn against, in days.
 *
 * A fixed ceiling, not derived from live data across every tracked repo —
 * that would need RepoDetail (which only ever fetches *one* repo) to also
 * fetch every other tracked repo just to size a bar. 15 days comfortably
 * covers a p95 for a healthy or a struggling repo; a bar that pins at 100%
 * past that is itself a signal worth seeing. */
export const PERCENTILE_SCALE_DAYS = 15;

/** Reads a percentile written as "11h" or "2.1d" back into days. */
export function percentileDays(value: string): number {
  const amount = parseFloat(value);
  if (Number.isNaN(amount)) return 0;
  return value.includes("d") ? amount : amount / 24;
}

/** `--chart-1` through `--chart-8`, assigned by a repo's position in the
 *  tracked list — stable across the sidebar, every chart, and every
 *  sparkline, however many repos are actually selected on a given page. */
const CHART_COLOR_COUNT = 8;
export function repoColor(repoId: string, trackedRepos: string[]): string {
  const index = trackedRepos.indexOf(repoId);
  return `var(--chart-${((index >= 0 ? index : 0) % CHART_COLOR_COUNT) + 1})`;
}

/** Just the repo name, for space-constrained labels (the Compare toggles,
 *  the sidebar before the redesign switched to the full id — kept for
 *  anywhere that still wants it). */
export function repoShort(repoId: string): string {
  return repoId.split("/")[1] ?? repoId;
}

/** The user's color-scheme choice — "system" meaning "no preference of its
 *  own, follow the OS". See lib/themeContext.tsx, which owns the state
 *  itself; the type lives here with the app's other cross-file shapes
 *  (same as `CurrentUser` above), since ThemeToggle needs it too. */
export type Theme = "light" | "dark" | "system";

/** The user's accent choice — one hue behind the folder icons, the commit
 *  heatmap, the merge-time bars, and the percentile bars (see index.css's
 *  own note for what it covers and why it isn't the chart palette). Lives
 *  here with `Theme` for the same reason; the hues themselves are in
 *  lib/accents.ts, which is the list this union has to stay in step with. */
export type Accent =
  | "blue"
  | "violet"
  | "teal"
  | "emerald"
  | "amber"
  | "rose"
  | "pink";
