/** One segment of the breadcrumb trail. `href` is omitted for the current
 *  page — the trailing crumb, or a middle one that isn't actually a
 *  distinct navigable page (there is no standalone "Repositories" view). */
export type Crumb = { label: string; href?: string };

/**
 * The breadcrumb trail for the current route.
 *
 * Overview and Compare are top-level, sibling views (see the Sidebar's own
 * "Views" group) — neither is nested under the other, or under some
 * "Repositories" hub that doesn't exist as an actual page, so each gets a
 * single, unlinked crumb naming itself. A repo's detail page *is* reached
 * by drilling into one specific repo from Overview's own table (or the
 * Sidebar's mirror of it) — so that's the one route that gets a real
 * two-level trail, branching off Overview specifically.
 */
export function crumbsFor(pathname: string): Crumb[] {
  if (pathname === "/compare") return [{ label: "Compare" }];
  if (pathname.startsWith("/repos/")) {
    // The full owner/repo, not just the name — the crumb should read the
    // same as the page's own <h1> and the sidebar entry that led here.
    const repo = decodeURIComponent(pathname.slice("/repos/".length));
    return [{ label: "Overview", href: "/" }, { label: repo }];
  }
  return [{ label: "Overview" }];
}
