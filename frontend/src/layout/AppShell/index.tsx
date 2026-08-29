import { useEffect, useState } from "react";
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

// Matches the `lg:`/`max-lg:` breakpoint used below on the Sidebar itself —
// keep the two in sync if this ever changes, since the JS-driven default
// open state and the CSS that turns the sidebar into an overlay both need
// to agree on where "desktop" starts.
const DESKTOP_QUERY = "(min-width: 1024px)";

/**
 * Docked-vs-overlay is a layout decision (does the sidebar take up real
 * flex width, or float above the content), which CSS alone can express —
 * but *whether it starts open* has to be a JS default, since starting a
 * mobile visitor with a full-screen drawer already covering the page on
 * load would be exactly backwards from what "collapsed on mobile" means.
 */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);
  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const handleChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);
  return isDesktop;
}

export function AppShell() {
  const location = useLocation();
  const { repoNames } = useTrackedRepos();
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(isDesktop);

  // "Adjusting state when a prop changes", React's own name for this
  // pattern (see the useState docs) — setState called conditionally during
  // render, not inside an effect, specifically to avoid the extra
  // commit-then-re-render round trip an effect would add (and the
  // react-hooks/set-state-in-effect lint that comes with it). Each block
  // tracks the previous render's value of the thing it's reacting to, so
  // it fires exactly once per actual change rather than on every render.
  //
  // Re-synced whenever the breakpoint itself is crossed (resizing the
  // window, rotating a tablet) — not just read once at mount — so crossing
  // down to mobile never leaves a docked-open sidebar stuck as a
  // full-width overlay, and crossing up to desktop never leaves the dock
  // closed just because it happened to be closed as a mobile overlay.
  const [prevIsDesktop, setPrevIsDesktop] = useState(isDesktop);
  if (isDesktop !== prevIsDesktop) {
    setPrevIsDesktop(isDesktop);
    setOpen(isDesktop);
  }

  // Closes the overlay after an actual navigation rather than on every
  // click inside the sidebar (which would also fire for, say, a click that
  // lands on non-interactive whitespace) — mobile only, since on desktop
  // the dock staying open across navigation is the entire point of a dock.
  const [prevPathname, setPrevPathname] = useState(location.pathname);
  if (location.pathname !== prevPathname) {
    setPrevPathname(location.pathname);
    if (!isDesktop) setOpen(false);
  }

  useEffect(() => {
    if (isDesktop || !open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isDesktop, open]);

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
    <SidebarProvider open={open} onOpenChange={setOpen} className="h-svh overflow-hidden">
      {/* Docked (an ordinary flex sibling of the content, per the library's
       * own layout) at lg and up; below that, taken out of flow entirely
       * via `fixed` so it floats *above* full-width content instead of
       * sharing the row with it — the actual fix for "the sidebar
       * shouldn't affect content width on mobile". z-40 clears the
       * backdrop below (z-20) and the Topbar above that (z-30), so the
       * open drawer always renders on top of both. */}
      <Sidebar className="max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:shadow-xl">
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

      {/* z-20: above <main>'s own stacking (auto) so it actually dims the
       * content, below Topbar's z-30 so the sticky header (and its
       * SidebarTrigger, the other way to close this) stays visible and
       * clickable rather than getting visually buried under the dimmer —
       * Topbar's own opaque background is what keeps the backdrop from
       * showing through it despite sitting underneath. */}
      {!isDesktop && open ? (
        <div
          aria-hidden="true"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-20 bg-slate-950/50"
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col bg-slate-50 dark:bg-slate-900">
        <Topbar crumbs={crumbsFor(location.pathname)} />
        {/* inert, not aria-hidden: the goal is unfocusable-and-unclickable
         * while the drawer covers it, same as Dialog/Popover do for
         * whatever sits behind them — not merely hidden from a screen
         * reader while still reachable by keyboard. */}
        <main className="flex-1 overflow-y-auto p-6" inert={!isDesktop && open ? true : undefined}>
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}
