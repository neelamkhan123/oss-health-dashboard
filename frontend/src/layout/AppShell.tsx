import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  DateRangePicker,
  defaultDateRangePresets,
  type DateRange,
} from "@neelamkhan21/ui";
import { LayoutDashboard, Activity, Folder, Zap } from "lucide-react";
import { Fragment, type MouseEvent, type ReactNode } from "react";
import { useDateRange } from "../lib/dateRangeContext";
import { useSyncStatus } from "../lib/syncContext";
import { useTrackedRepos } from "../lib/trackedReposContext";

/** One segment of the breadcrumb trail. `href` is omitted for the current
 *  page — the trailing crumb, or a middle one that isn't actually a
 *  distinct navigable page (there is no standalone "Repositories" view). */
type Crumb = { label: string; href?: string };

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
function crumbsFor(pathname: string): Crumb[] {
  if (pathname === "/compare") return [{ label: "Compare" }];
  if (pathname.startsWith("/repos/")) {
    // The full owner/repo, not just the name — the crumb should read the
    // same as the page's own <h1> and the sidebar entry that led here.
    const repo = decodeURIComponent(pathname.slice("/repos/".length));
    return [{ label: "Overview", href: "/" }, { label: repo }];
  }
  return [{ label: "Overview" }];
}

export function AppShell() {
  const location = useLocation();
  const { repoNames } = useTrackedRepos();

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <span className="flex items-center gap-2.5 px-2 text-sm font-semibold tracking-tight text-slate-950 dark:text-white">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-[13px] text-white dark:bg-white dark:text-slate-950">
              N
            </span>
            OSS Health
          </span>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <GroupLabel>Views</GroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarNavButton to="/" icon={<LayoutDashboard size={16} />}>
                  Overview
                </SidebarNavButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarNavButton to="/compare" icon={<Activity size={16} />}>
                  Compare
                </SidebarNavButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          <SidebarGroup>
            <GroupLabel count={repoNames.length}>Tracked repos</GroupLabel>
            <SidebarMenu>
              {repoNames.map((repo) => (
                <SidebarMenuItem key={repo}>
                  <SidebarNavButton
                    to={`/repos/${encodeURIComponent(repo)}`}
                    icon={<Folder size={16} />}
                  >
                    {repo}
                  </SidebarNavButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <div className="flex min-w-0 flex-1 flex-col bg-slate-50 dark:bg-slate-900">
        <Topbar crumbs={crumbsFor(location.pathname)} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}

/**
 * A sidebar group heading, with an optional count on the right. Not
 * `SidebarGroupLabel` when a count is present: that component renders a
 * plain label and has no slot for trailing content, and wrapping a flex row
 * inside it would fight its own text styling.
 */
function GroupLabel({
  children,
  count,
}: {
  children: ReactNode;
  count?: number;
}) {
  return (
    <div className="flex items-center justify-between px-2 py-1 text-xs font-medium text-slate-500 dark:text-slate-400">
      <span>{children}</span>
      {count !== undefined ? (
        <span className="tabular-nums text-slate-400 dark:text-slate-500">
          {count}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Writes the selected range the way the preset list does ("Last 90 days")
 * whenever it still matches one, falling back to the picker's own from–to
 * formatting for a hand-picked custom range. A dashboard filter reads as a
 * *period* far more often than as two dates, and the preset label is the
 * name of that period.
 */
function formatRange(range: DateRange): string {
  const match = defaultDateRangePresets.find((preset) => {
    const presetRange = preset.getRange();
    return (
      presetRange.from.getTime() === range.from.getTime() &&
      presetRange.to.getTime() === range.to.getTime()
    );
  });
  if (match) return match.label;
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  });
  return `${formatter.format(range.from)} – ${formatter.format(range.to)}`;
}

function Topbar({ crumbs }: { crumbs: Crumb[] }) {
  const navigate = useNavigate();
  const { range, setRange } = useDateRange();
  const { phase, runSync } = useSyncStatus();

  // One handler, parameterized by target — every crumb with an `href`
  // navigates the same client-side way (see SidebarNavButton below for the
  // identical reasoning on why this isn't a plain `<a>`/`Link`).
  const handleCrumbClick =
    (href: string) => (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
        return;
      }
      e.preventDefault();
      navigate(href);
    };

  // Just a busy state here — the numbers (and the Stop button) live on the
  // progress toast (see lib/syncContext.tsx), not duplicated on the button.
  const isSyncing = phase !== "idle";

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 px-3 dark:border-slate-800 dark:bg-slate-950">
      <SidebarTrigger />
      {/* A single crumb ("Overview", "Compare") names a top-level view the
       * Sidebar already highlights as active — showing it here just
       * repeats that. The trail only earns its place once there's an
       * actual "here, via there" to show, i.e. a repo's detail page. */}
      {crumbs.length > 1 ? (
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((crumb, i) => (
              <Fragment key={crumb.label}>
                {i > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem>
                  {crumb.href ? (
                    <BreadcrumbLink
                      href={crumb.href}
                      onClick={handleCrumbClick(crumb.href)}
                    >
                      {crumb.label}
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      ) : null}
      <div className="flex-1" />
      {/* DateRangePicker renders its own outline trigger with a calendar
       * icon, so it *is* the date button rather than something a separate
       * button has to open — className only trims it to the `sm` height the
       * "Sync now" button beside it uses. Controlled by DateRangeProvider
       * (see lib/dateRangeContext.tsx) so Overview, RepoDetail, and Compare
       * — which live in a separate tree from this Topbar, under <Outlet> —
       * can all read the selection and refetch when it changes. */}
      <DateRangePicker
        className="h-8 gap-1.5 px-3 text-xs"
        value={range}
        onValueChange={setRange}
        formatValue={formatRange}
        disabled={(date) => date > new Date()}
      />
      <Button
        size="sm"
        icon={<Zap size={14} />}
        loading={isSyncing}
        onClick={runSync}
      >
        {isSyncing ? "Syncing…" : "Sync now"}
      </Button>
    </header>
  );
}

// SidebarMenuButton always renders a real <a href>, so it can't be nested
// inside react-router's <NavLink> (which renders its own <a>) — that
// produces an invalid <a> inside <a> and a hydration error. Instead, compute
// active state from the current location and drive navigation from
// onClick, the same way any real anchor integrates with client-side routing.
function SidebarNavButton({
  to,
  icon,
  children,
}: {
  to: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = location.pathname === to;

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return; // let the browser handle new-tab/new-window clicks normally
    }
    e.preventDefault();
    navigate(to);
  };

  return (
    <SidebarMenuButton
      href={to}
      icon={icon}
      isActive={isActive}
      onClick={handleClick}
    >
      {children}
    </SidebarMenuButton>
  );
}
