import { lazy } from "react";

// Route-based code splitting (Part 13.1), pulled into their own module: a
// file mixing lazy()-wrapped component references with non-component code
// (main.tsx renders the app, it doesn't export components) breaks Fast
// Refresh's ability to tell what's a component boundary — the same reason
// LazyTrendChartCard lives apart from the pages that use it. The
// .then((m) => ({ default: m.X })) adapts each page's named export to what
// lazy() requires (a default export) without changing how the pages
// themselves are written.
export const LazyLogin = lazy(() =>
  import("./Login").then((m) => ({ default: m.Login })),
);
export const LazyOverview = lazy(() =>
  import("./Overview").then((m) => ({ default: m.Overview })),
);
export const LazyRepoDetail = lazy(() =>
  import("./RepoDetail").then((m) => ({ default: m.RepoDetail })),
);
export const LazyCompare = lazy(() =>
  import("./Compare").then((m) => ({ default: m.Compare })),
);
