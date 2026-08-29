import { Outlet, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
} from "@neelamkhan21/ui";
import { LayoutDashboard, Activity, Folder } from "lucide-react";
import { useTrackedRepos } from "../../lib/trackedReposContext";
import { crumbsFor } from "./crumbs";
import { GroupLabel } from "./GroupLabel";
import { SidebarNavButton } from "./SidebarNavButton";
import { Topbar } from "./Topbar";

export function AppShell() {
  const location = useLocation();
  const { repoNames } = useTrackedRepos();

  return (
    // h-svh + overflow-hidden, on top of the library's own min-h-svh:
    // SidebarProvider's own class only sets a *floor* on its height, not a
    // ceiling, so with no cap it grows to fit whatever <main> renders (a
    // long repo-detail page measured at 6700px+) rather than staying
    // pinned to the viewport. That's what let the whole page scroll as one
    // unit — dragging the sidebar's own h-svh <aside> along with it, since
    // "always exactly one viewport tall" and "never moves as the page
    // scrolls" aren't the same guarantee. Capping the actual height here
    // gives <main>'s existing flex-1 overflow-y-auto a bounded height to
    // size against, so it becomes the only thing that scrolls.
    <SidebarProvider className="h-svh overflow-hidden">
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
