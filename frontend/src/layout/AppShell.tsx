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
  Separator,
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
import type { MouseEvent, ReactNode } from "react";
import { useDateRange } from "../lib/dateRangeContext";
import { useSyncStatus } from "../lib/syncContext";
import { useTrackedRepos } from "../lib/trackedReposContext";

/** The trailing breadcrumb crumb for the current route. */
function currentCrumb(pathname: string): string {
  if (pathname === "/") return "Overview";
  if (pathname === "/compare") return "Compare";
  if (pathname.startsWith("/repos/")) {
    // The full owner/repo, not just the name — the crumb should read the
    // same as the page's own <h1> and the sidebar entry that led here.
    return decodeURIComponent(pathname.slice("/repos/".length));
  }
  return "Overview";
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
        <Topbar crumb={currentCrumb(location.pathname)} />
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

function Topbar({ crumb }: { crumb: string }) {
  const navigate = useNavigate();
  const { range, setRange } = useDateRange();
  const { phase, runSync } = useSyncStatus();

  const handleHomeClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    e.preventDefault();
    navigate("/");
  };

  // Just a busy state here — the numbers (and the Stop button) live on the
  // progress toast (see lib/syncContext.tsx), not duplicated on the button.
  const isSyncing = phase !== "idle";

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-950">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-5" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/" onClick={handleHomeClick}>
              Repositories
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{crumb}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
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
      <Button size="sm" icon={<Zap size={14} />} loading={isSyncing} onClick={runSync}>
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
    <SidebarMenuButton href={to} icon={icon} isActive={isActive} onClick={handleClick}>
      {children}
    </SidebarMenuButton>
  );
}
