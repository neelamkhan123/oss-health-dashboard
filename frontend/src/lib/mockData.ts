// Placeholder content for sections that don't have a backend endpoint yet.
// Every export here is fake, deterministic (no Math.random() — nothing
// should visibly jitter on re-render), and named after the real endpoint
// it's standing in for so it's easy to find and delete once that endpoint
// exists. See BUILD_GUIDE.md Part 9.9 for the list of endpoints still to
// build.
//
// ── How big the gap actually is ───────────────────────────────────────────
// Two different sizes of gap are represented in this file, and it's worth
// keeping them apart when planning the backend work:
//
// 1. NUMBERS THE BACKEND COULD COMPUTE TODAY from what it already stores —
//    it just doesn't have the endpoint yet. `merge` (avg. time to merge),
//    `mergeRate`, `issues`, `contrib`, `commits`, `dist` (the merge-time
//    histogram) and `pct` (its percentiles) all fall here: PullRequest has
//    created_at/merged_at, Contributor has contributions, so these are
//    aggregation queries away.
//
// 2. NUMBERS WITH NO BACKEND EQUIVALENT AT ALL — nothing in the schema can
//    produce them, so these need a data-model change before they need an
//    endpoint. These are the expensive ones:
//      • `response` / `trendIssue` (median time to first maintainer reply).
//        The Issue model has no comment tracking whatsoever — no comments
//        table, no first_response_at column — so this can't be derived from
//        stored data at any cost. It needs the issue-comments API synced
//        (a second, rate-limit-hungry call per issue) plus a definition of
//        "maintainer" the sync can actually evaluate.
//      • `stars`, `forks` — never synced from GitHub. They're on the repo
//        payload the sync already fetches, so this is the cheap half: add
//        columns and read them, but they'd be point-in-time only. Trending
//        them would need a snapshot table.
//      • `openPrs` — PullRequest has no state column, only merged_at, so
//        "open" can't currently be distinguished from "closed unmerged".
//      • `status` / `statusVariant` — not a metric at all but a *policy*
//        ("backlog growing" vs "healthy"). Someone has to define the
//        thresholds before this can be computed rather than asserted.
//      • `top[].prs` / `top[].reviews` / `top[].last` — Contributor stores
//        a single `contributions` count; per-contributor PR and review
//        counts and a last-active timestamp are three more fields the sync
//        doesn't collect.
//
// The numbers below are the ones the design prototype was built against,
// kept verbatim so the UI can be compared against it directly.

/** A metric with its raw value (for sorting/comparison) and its display string. */
export type MetricValue = {
  /** The sortable, comparable number. */
  v: number;
  /** Pre-formatted for display — thousands separators, units. */
  d: string;
};

export type MockContributor = {
  login: string;
  commits: number;
  prs: number;
  reviews: number;
  /** Relative, pre-formatted ("2h ago"). See gap (2) above. */
  last: string;
};

/** `Badge`'s variant vocabulary, narrowed to the ones a repo status uses. */
export type StatusVariant = "secondary" | "destructive" | "outline" | "default";

export type MockRepo = {
  /** `owner/name` — the id every route, table row and sidebar entry keys off. */
  id: string;
  /** Just the repo name, for space-constrained labels (the Compare toggles). */
  short: string;
  lang: string;
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
  /** 12 points, the 90-day trend shown in the tracked-repos table. */
  spark: number[];
  /** 12 monthly points — median hours from PR open to merge. */
  trendMerge: number[];
  /** 12 monthly points — median hours to first maintainer reply. */
  trendIssue: number[];
  /** Commits in the last 12 months, pre-formatted. */
  commitsTotal: string;
  /** This repo's assigned series color, stable across every chart and table. */
  color: string;
  /** Merged-PR counts per MERGE_TIME_BUCKETS entry, same order. */
  dist: number[];
  /** [label, value] pairs, value written as hours ("11h") or days ("2.1d"). */
  pct: [string, string][];
  top: MockContributor[];
};

/** The 12 months the trend charts and sparklines are plotted over. */
export const MOCK_TREND_MONTHS = [
  "Sep", "Oct", "Nov", "Dec", "Jan", "Feb",
  "Mar", "Apr", "May", "Jun", "Jul", "Aug",
];

/**
 * Stands in for the per-repo half of GET /api/dashboard/overview, plus the
 * whole of the not-yet-built GET /api/dashboard/repos/{id} and
 * GET /api/dashboard/compare. One record per tracked repo, so Overview,
 * RepoDetail and Compare all read the same numbers for a given repo rather
 * than each inventing its own.
 *
 * Order matches TRACKED_REPOS, and each repo's `color` is its position in
 * the series palette — repo N is --chart-N. That's what keeps a repo the
 * same color in the sidebar-ordered table, its sparkline and its chart line.
 */
export const MOCK_REPOS: MockRepo[] = [
  {
    id: "facebook/react",
    short: "react",
    lang: "JavaScript",
    license: "MIT",
    stars: "231k",
    forks: "47.6k",
    openPrs: "148",
    merge: { v: 38.4, d: "38.4h" },
    response: { v: 5.1, d: "5.1h" },
    issues: { v: 1043, d: "1,043" },
    contrib: { v: 1684, d: "1,684" },
    mergeRate: { v: 71, d: "71%" },
    commits: { v: 96, d: "96" },
    status: "Healthy",
    statusVariant: "secondary",
    spark: [46, 44, 45, 42, 41, 43, 40, 39, 40, 38, 39, 38.4],
    trendMerge: [46, 44, 45, 42, 41, 43, 40, 39, 40, 38, 39, 38.4],
    trendIssue: [7.4, 7.1, 6.8, 6.9, 6.2, 6.4, 5.9, 5.6, 5.8, 5.4, 5.2, 5.1],
    commitsTotal: "12,904",
    color: "var(--chart-1)",
    dist: [142, 318, 407, 265, 118, 54],
    pct: [["p50", "11h"], ["p75", "2.1d"], ["p90", "5.4d"], ["p95", "9.2d"]],
    top: [
      { login: "r-lindqvist", commits: 412, prs: 96, reviews: 311, last: "2h ago" },
      { login: "kmoreno", commits: 388, prs: 74, reviews: 402, last: "5h ago" },
      { login: "t-abiola", commits: 254, prs: 61, reviews: 188, last: "1d ago" },
      { login: "wenjun-hu", commits: 197, prs: 52, reviews: 96, last: "1d ago" },
      { login: "psaraiva", commits: 164, prs: 38, reviews: 121, last: "3d ago" },
      { login: "amirov", commits: 121, prs: 27, reviews: 64, last: "4d ago" },
      { login: "d-okonkwo", commits: 98, prs: 22, reviews: 41, last: "6d ago" },
      { login: "lgrimaldi", commits: 74, prs: 19, reviews: 33, last: "8d ago" },
    ],
  },
  {
    id: "vuejs/core",
    short: "core",
    lang: "TypeScript",
    license: "MIT",
    stars: "48.9k",
    forks: "8.4k",
    openPrs: "63",
    merge: { v: 26.7, d: "26.7h" },
    response: { v: 3.8, d: "3.8h" },
    issues: { v: 612, d: "612" },
    contrib: { v: 498, d: "498" },
    mergeRate: { v: 78, d: "78%" },
    commits: { v: 41, d: "41" },
    status: "Healthy",
    statusVariant: "secondary",
    spark: [33, 32, 31, 30, 31, 29, 28, 29, 27, 28, 27, 26.7],
    trendMerge: [33, 32, 31, 30, 31, 29, 28, 29, 27, 28, 27, 26.7],
    trendIssue: [5.9, 5.6, 5.4, 5.1, 4.8, 4.9, 4.4, 4.2, 4.3, 4.0, 3.9, 3.8],
    commitsTotal: "5,318",
    color: "var(--chart-2)",
    dist: [96, 241, 288, 141, 52, 19],
    pct: [["p50", "7h"], ["p75", "1.4d"], ["p90", "3.6d"], ["p95", "6.1d"]],
    top: [
      { login: "j-vasquez", commits: 296, prs: 88, reviews: 254, last: "3h ago" },
      { login: "haruna-i", commits: 211, prs: 57, reviews: 163, last: "9h ago" },
      { login: "mgrabowski", commits: 148, prs: 41, reviews: 88, last: "2d ago" },
      { login: "s-nayar", commits: 112, prs: 33, reviews: 71, last: "2d ago" },
      { login: "efontaine", commits: 87, prs: 24, reviews: 52, last: "5d ago" },
      { login: "byrne-k", commits: 61, prs: 18, reviews: 29, last: "7d ago" },
      { login: "zhaoyi-l", commits: 44, prs: 12, reviews: 21, last: "9d ago" },
      { login: "n-adeyemi", commits: 31, prs: 9, reviews: 14, last: "12d ago" },
    ],
  },
  {
    id: "microsoft/vscode",
    short: "vscode",
    lang: "TypeScript",
    license: "MIT",
    stars: "163k",
    forks: "29.1k",
    openPrs: "421",
    merge: { v: 52.9, d: "52.9h" },
    response: { v: 9.4, d: "9.4h" },
    issues: { v: 6832, d: "6,832" },
    contrib: { v: 2166, d: "2,166" },
    mergeRate: { v: 64, d: "64%" },
    commits: { v: 177, d: "177" },
    status: "Backlog growing",
    statusVariant: "destructive",
    spark: [44, 46, 47, 49, 48, 50, 51, 50, 52, 51, 53, 52.9],
    trendMerge: [44, 46, 47, 49, 48, 50, 51, 50, 52, 51, 53, 52.9],
    trendIssue: [7.8, 8.1, 8.4, 8.2, 8.8, 9.0, 8.7, 9.1, 9.3, 9.2, 9.5, 9.4],
    commitsTotal: "24,161",
    color: "var(--chart-3)",
    dist: [88, 264, 512, 388, 214, 132],
    pct: [["p50", "19h"], ["p75", "3.4d"], ["p90", "8.1d"], ["p95", "14.6d"]],
    top: [
      { login: "avilaverde", commits: 604, prs: 141, reviews: 512, last: "1h ago" },
      { login: "s-kowalczyk", commits: 511, prs: 118, reviews: 388, last: "4h ago" },
      { login: "mei-tanaka", commits: 402, prs: 96, reviews: 341, last: "6h ago" },
      { login: "o-brennan", commits: 344, prs: 81, reviews: 219, last: "1d ago" },
      { login: "rkulkarni", commits: 288, prs: 66, reviews: 176, last: "2d ago" },
      { login: "farida-b", commits: 214, prs: 48, reviews: 133, last: "3d ago" },
      { login: "tvoigt", commits: 166, prs: 39, reviews: 91, last: "5d ago" },
      { login: "chen-wei", commits: 121, prs: 28, reviews: 62, last: "8d ago" },
    ],
  },
];

const REPOS_BY_ID: Record<string, MockRepo> = Object.fromEntries(
  MOCK_REPOS.map((repo) => [repo.id, repo]),
);

/** Looks a repo up by `owner/name`, falling back to the first tracked repo
 *  so an unknown/typo'd :repoId route renders a page instead of crashing. */
export function mockRepo(id: string | undefined): MockRepo {
  return (id ? REPOS_BY_ID[id] : undefined) ?? MOCK_REPOS[0];
}

/**
 * Stands in for the workspace-wide half of GET /api/dashboard/overview —
 * the four KPI tiles. `delta` is a signed ratio, matching StatCard's own
 * prop (0.124 = a 12.4% rise), with `deltaLabel` naming the comparison
 * window; that's the shape the real aggregation should return too.
 */
export const MOCK_OVERVIEW_STATS = {
  avgMergeTime: {
    value: "39.3h",
    // 3.2h faster than 42.5h.
    delta: -0.075,
    deltaLabel: "vs. last period",
    sparkline: [46, 44, 45, 42, 41, 43, 40, 39, 40, 38, 39, 39.3],
  },
  openIssues: {
    value: "8,487",
    // +412 on 8,075.
    delta: 0.051,
    deltaLabel: "vs. last period",
    sparkline: [7620, 7810, 7902, 8040, 8112, 8190, 8244, 8301, 8355, 8402, 8441, 8487],
  },
  contributors: {
    value: "4,348",
    // +186 on 4,162.
    delta: 0.045,
    deltaLabel: "vs. last period",
    sparkline: [3980, 4020, 4066, 4102, 4141, 4180, 4212, 4248, 4276, 4304, 4331, 4348],
  },
  prsThisWeek: {
    value: "314",
    delta: 0.124,
    deltaLabel: "vs. last week",
    sparkline: [241, 268, 254, 277, 262, 289, 271, 296, 284, 302, 291, 314],
  },
};

/**
 * Stands in for a per-day commit count endpoint
 * (GET /api/dashboard/repos/{id}/commits/heatmap): 53 weeks x 7 days of
 * counts, week-major, matching a GitHub contribution graph.
 *
 * Deterministic per repo via a plain LCG seeded from the repo id, and
 * scaled by that repo's commits-per-week so a busy repo reads visibly
 * denser than a quiet one. Weekends are capped lower than weekdays, and
 * ~7% of days are forced to zero, because a uniform grid reads as noise
 * rather than as activity.
 */
export function mockCommitHeatmap(repoId: string, weeks = 53): number[][] {
  const repo = mockRepo(repoId);

  let seed = 0;
  for (let i = 0; i < repo.id.length; i += 1) {
    seed = (seed * 31 + repo.id.charCodeAt(i)) % 100000;
  }
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  // 96 commits/week (react's rate) is the reference density the cell-color
  // thresholds in CommitHeatmap were picked against.
  const scale = repo.commits.v / 96;

  return Array.from({ length: weeks }, () =>
    Array.from({ length: 7 }, (_, day) => {
      const weekend = day >= 5;
      const value = Math.floor(rand() * (weekend ? 5 : 15) * scale);
      return rand() < 0.07 ? 0 : value;
    }),
  );
}

/**
 * Stands in for a merge-time histogram endpoint
 * (GET /api/dashboard/repos/{id}/merge-time-distribution). Bucket edges are
 * a placeholder guess — pick real ones once actual merge times are synced
 * and you can see where they cluster.
 */
export const MERGE_TIME_BUCKETS = ["<1h", "1–6h", "6–24h", "1–3d", "3–7d", ">7d"];

/**
 * The upper bound the percentile bars are drawn against — the largest p95
 * across every tracked repo, in days.
 *
 * A shared scale, not a per-repo one: bars normalized to their own repo's
 * p95 would make every repo's p95 a full bar, which says nothing. Anchoring
 * every repo to the same ceiling is what makes "vscode's tail is much
 * longer than vue's" visible by flicking between the two pages.
 */
export const PERCENTILE_SCALE_DAYS = Math.max(
  ...MOCK_REPOS.map((repo) => percentileDays(repo.pct[repo.pct.length - 1][1])),
);

/** Reads a percentile written as "11h" or "2.1d" back into days. */
export function percentileDays(value: string): number {
  const amount = parseFloat(value);
  return value.includes("d") ? amount : amount / 24;
}
