import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Tabs,
  TabsList,
  TabsTrigger,
} from "neelam-ui";
import {
  LayoutDashboard,
  Activity,
  LogOut,
  Sun,
  MonitorCog,
  Moon,
} from "lucide-react";
import { useTrackedRepos } from "../../lib/trackedReposContext";
import { useTheme } from "../../lib/themeContext";
import type { Theme } from "../../lib/types";
import { crumbsFor } from "./crumbs";
import { AccentPicker } from "./AccentPicker";
import { GroupLabel } from "./GroupLabel";
import { RepoNavItem } from "./RepoNavItem";
import { SidebarNavButton } from "./SidebarNavButton";
import { Topbar } from "./Topbar";
import { useAuth } from "../../lib/authContext";

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
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia(DESKTOP_QUERY).matches,
  );
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
  const { sidebarRepos } = useTrackedRepos();
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(isDesktop);

  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  const handleSignOut = async () => {
    await logout();
    // RequireAuth would redirect here on its own once `user` goes null, but
    // navigating explicitly avoids a frame of the guard's loading state.
    navigate("/login", { replace: true });
  };

  // Initials from the name when we have one, otherwise the first letter of
  // the email — every account has one of the two, so the fallback never
  // renders empty.
  const initials = (user?.name ?? user?.email ?? "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

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
    // The shell must be exactly one viewport tall and no taller: without a
    // ceiling it grows to fit whatever <main> renders (a long repo-detail
    // page measured at 6700px+), which makes the whole page scroll as one
    // unit and drags the sidebar along with it, and leaves <main>'s
    // flex-1 overflow-y-auto with no bounded height to size against.
    //
    // Set inline, and in `dvh`, rather than as `h-svh` classes, because
    // height was being derived from THREE separate places that could
    // disagree: SidebarProvider's own `min-h-svh`, an `h-svh` override
    // here (two conflicting utilities on one element — whichever Tailwind
    // happens to emit later silently wins, the same trap Calendar and
    // DateRangePicker both hit earlier), and Sidebar's <aside> reading
    // `h-svh` a third time on its own. An inline style has no such
    // ambiguity — the reasoning the library itself documents for
    // Sidebar's width — so this is now the single source of truth, with
    // the <aside> below just filling its parent instead of re-deriving.
    //
    // `dvh`, not `svh`: the spec defines the *small* viewport as the one
    // with dynamic UA interface expanded and explicitly permits UAs not
    // to update it as that UI changes, so `svh` can legitimately report a
    // shorter viewport than the window actually is — which renders as the
    // app ending early with dead space below it. `dvh` always tracks the
    // current viewport, which is what a fixed app shell needs.
    <SidebarProvider
      open={open}
      onOpenChange={setOpen}
      style={{ height: "100dvh", minHeight: "100dvh" }}
      className="overflow-hidden"
    >
      {/* Docked (an ordinary flex sibling of the content, per the library's
       * own layout) at lg and up; below that, taken out of flow entirely
       * via `fixed` so it floats *above* full-width content instead of
       * sharing the row with it — the actual fix for "the sidebar
       * shouldn't affect content width on mobile". z-40 clears the
       * backdrop below (z-20) and the Topbar above that (z-30), so the
       * open drawer always renders on top of both. */}
      <Sidebar
        // Fills the shell above rather than reading the viewport a second
        // time — Sidebar's own class hardcodes `h-svh`, so without this the
        // panel and the shell it sits in are two independent measurements
        // of "one viewport" that can disagree. Inline for the same
        // beats-any-class reason as the shell's own height.
        style={{ height: "100%" }}
        className="max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:shadow-xl"
      >
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
            <GroupLabel count={sidebarRepos.length}>Tracked repos</GroupLabel>
            {/* Pinned first — see trackedReposContext's `sidebarRepos`; each
             * entry carries its own right-click menu (pin, remove). */}
            <SidebarMenu>
              {sidebarRepos.map((repo) => (
                <RepoNavItem key={repo.fullName} repo={repo} />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <DropdownMenu>
            <DropdownMenuTrigger
              side="top"
              className="flex items-center gap-2.5 rounded-full p-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-all ease-in-out duration-200 w-fit"
            >
              <Avatar size="sm">
                {/* Mounted unconditionally when there's a src — AvatarImage tracks
                 * its own load state, and AvatarFallback gives way once it
                 * resolves, so a slow or dead avatar URL never leaves a gap. */}
                {user?.avatarUrl ? (
                  <AvatarImage src={user.avatarUrl} alt="" />
                ) : null}
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {/* The email even when the name is shown above — it's how you tell
               * which of two accounts you're actually in. */}
              <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Theme</DropdownMenuLabel>
              {/* A segmented control, not three DropdownMenuItems — the
               * three options are mutually exclusive states of one
               * setting (exactly what Tabs already models), not separate
               * actions, and picking one shouldn't close this menu the
               * way choosing "Sign out" does. */}
              <div className="px-2 pb-1.5">
                <Tabs
                  value={theme}
                  onValueChange={(value) => setTheme(value as Theme)}
                >
                  <TabsList className="w-full">
                    <TabsTrigger
                      value="light"
                      className="flex items-center justify-center"
                    >
                      <Sun size={14} />
                    </TabsTrigger>
                    <TabsTrigger
                      value="dark"
                      className="flex items-center justify-center"
                    >
                      <Moon size={14} />
                    </TabsTrigger>
                    <TabsTrigger
                      value="system"
                      className="flex items-center justify-center"
                    >
                      <MonitorCog size={14} />
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <DropdownMenuLabel>Accent</DropdownMenuLabel>
              <AccentPicker />
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut size={14} /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
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
        {/* `relative` is load-bearing, not decoration. Tailwind's `sr-only`
         * is `position: absolute`, and an absolutely positioned element is
         * only clipped by an `overflow` ancestor when that ancestor is in
         * its *containing-block* chain. With everything up to <html>
         * position:static, any `sr-only` in here resolved against the
         * initial containing block instead — escaping this element's own
         * overflow-y:auto and contributing its static position to the
         * *document's* scroll height. PaginationEllipsis's "More pages"
         * span, sitting at the bottom of a long repo-detail page, pushed
         * documentElement.scrollHeight to 1594px against a 1003px
         * viewport: ~590px of dead scrollable space below an app whose
         * <body> measured a correct 1003px the whole time (which is
         * exactly why it looked like a browser bug). Positioning this
         * element makes it the containing block for those descendants, so
         * they're clipped here and can't reach the document at all — and
         * that holds for every sr-only in the app, not just that one.
         *
         * inert, not aria-hidden: the goal is unfocusable-and-unclickable
         * while the drawer covers it, same as Dialog/Popover do for
         * whatever sits behind them — not merely hidden from a screen
         * reader while still reachable by keyboard. */}
        <main
          className="relative flex-1 overflow-y-auto p-6"
          inert={!isDesktop && open ? true : undefined}
        >
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}
