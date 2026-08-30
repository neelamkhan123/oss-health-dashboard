import { useNavigate } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  DateRangePicker,
  defaultDateRangePresets,
  SidebarTrigger,
  type DateRange,
} from "@neelamkhan21/ui";
import { Zap } from "lucide-react";
import { Fragment, useEffect, type MouseEvent } from "react";
import { useDateRange } from "../../lib/dateRangeContext";
import { useSyncStatus } from "../../lib/syncContext";
import type { Crumb } from "./crumbs";
import { ThemeToggle } from "./ThemeToggle";

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

export function Topbar({ crumbs }: { crumbs: Crumb[] }) {
  const navigate = useNavigate();
  const { range, setRange } = useDateRange();
  const { phase, runSync } = useSyncStatus();

  // One handler, parameterized by target — every crumb with an `href`
  // navigates the same client-side way (see SidebarNavButton for the
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

  // The DateRangePicker's popover positions itself via the library's own
  // clamp-to-viewport math, but the panel's rendered width keeps settling
  // in multiple steps after that math runs — measured directly across
  // several seconds: the panel's *own* box grows from ~496px to ~505px to
  // ~522px over roughly the first second it's open, each step independent
  // of anything this effect does (our own correction only ever touches
  // `left`, confirmed not to itself trigger a resize). The panel carries
  // `max-w-[calc(100vw-1rem)]`, and Popover's own effect sets
  // `document.body.style.overflow = "hidden"` while open — removing the
  // page's scrollbar shifts what `100vw` resolves to in some engines,
  // which lines up with a `vw`-based max-width settling asynchronously
  // relative to the scrollbar actually disappearing. The library's clamp
  // only ever runs once, against whatever width existed at that first
  // instant, so a width that keeps growing afterward can still push the
  // right edge past the viewport regardless of what the clamp calculated.
  //
  // A ResizeObserver reacts to the panel's box changing rather than
  // guessing which frame is safe to check, but didn't reliably catch
  // every one of these steps in testing — so a handful of delayed
  // re-checks back it up, cheap insurance against whichever step the
  // observer's callback coalescing happens to miss. Both are safe to
  // combine: correcting only when actually overflowing is what keeps this
  // from looping on its own writes, whichever path triggers it.
  //
  // `toggle`, not a click handler, because it's the library's own signal
  // for "this popover just opened" — and Popover-API toggle events don't
  // bubble, so this has to be a capturing listener at the document level
  // to see it at all, since the trigger itself isn't exposed for a
  // listener to attach to from outside the library.
  useEffect(() => {
    let resizeObserver: ResizeObserver | null = null;
    let fallbackTimers: ReturnType<typeof setTimeout>[] = [];

    const correctOverflow = (panel: HTMLElement) => {
      const rect = panel.getBoundingClientRect();
      const edgeMargin = 8; // matches the library's own margin constant
      const overflow = rect.right - (window.innerWidth - edgeMargin);
      if (overflow > 0.5) {
        panel.style.left = `${rect.left - overflow}px`;
      }
    };

    const clearFallbackTimers = () => {
      fallbackTimers.forEach(clearTimeout);
      fallbackTimers = [];
    };

    const handleToggle = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.getAttribute("aria-label") !== "Date range") return;

      resizeObserver?.disconnect();
      clearFallbackTimers();
      if ((event as ToggleEvent).newState === "open") {
        correctOverflow(target);
        resizeObserver = new ResizeObserver(() => correctOverflow(target));
        resizeObserver.observe(target);
        fallbackTimers = [100, 300, 800].map((delay) =>
          setTimeout(() => correctOverflow(target), delay),
        );
      } else {
        resizeObserver = null;
      }
    };

    document.addEventListener("toggle", handleToggle, true);
    return () => {
      document.removeEventListener("toggle", handleToggle, true);
      resizeObserver?.disconnect();
      clearFallbackTimers();
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 px-3 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
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
       * button has to open — `size="sm"` matches the "Sync now" button
       * beside it (previously a `className="h-8 ..."` override, which
       * didn't actually replace the trigger's own hardcoded md-size
       * classes — see DateRangePicker's own size prop docs). Controlled by
       * DateRangeProvider (see lib/dateRangeContext.tsx) so Overview,
       * RepoDetail, and Compare — which live in a separate tree from this
       * Topbar, under <Outlet> — can all read the selection and refetch
       * when it changes. */}
      <DateRangePicker
        size="sm"
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
      <ThemeToggle />
    </header>
  );
}
