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
} from "neelam-ui";
import { ChevronLeft, Zap } from "lucide-react";
import { Fragment, useEffect, type MouseEvent } from "react";
import { useDateRange } from "../../lib/dateRangeContext";
import { useSyncStatus } from "../../lib/syncContext";
import type { Crumb } from "./crumbs";

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

  // Where the narrow-viewport back button goes: the nearest navigable crumb
  // above the current page. Undefined on a top-level view, whose single
  // crumb has nothing above it — so no back button renders there either.
  const backTarget = crumbs
    .slice(0, -1)
    .reverse()
    .find((crumb) => crumb.href);

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
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-1 sm:gap-3 px-3 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
      <SidebarTrigger />
      {/* Below `sm` the trail is replaced outright by a back button rather
       * than compressed into a smaller trail — at 414px there's no room for
       * "Overview / owner/repo" alongside the date and sync controls, and a
       * truncated trail spends what room there is restating a repo name the
       * page's own <h1> already shows two lines below. One tap up the
       * hierarchy is the only part of a breadcrumb that a phone actually
       * needs.
       *
       * It navigates to the nearest *navigable* ancestor, not through
       * history: a breadcrumb describes where this page sits, and a middle
       * crumb can be unlinked (there's no standalone "Repositories" page,
       * per crumbs.ts), so the closest real page above here is the
       * destination. History back could land anywhere. */}
      {backTarget ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Back to ${backTarget.label}`}
          onClick={() => navigate(backTarget.href!)}
          className="shrink-0 sm:hidden"
        >
          <ChevronLeft size={16} />
        </Button>
      ) : null}

      {/* A single crumb ("Overview", "Compare") names a top-level view the
       * Sidebar already highlights as active — showing it here just
       * repeats that. The trail only earns its place once there's an
       * actual "here, via there" to show, i.e. a repo's detail page. */}
      {crumbs.length > 1 ? (
        // min-w-0 runs the whole chain down to the current page's span: a
        // flex item won't shrink below its content unless every ancestor
        // says it may, and without that a long repo id pushes the row wider
        // than the viewport instead of truncating.
        <Breadcrumb className="min-w-0 max-sm:hidden">
          {/* flex-nowrap overrides BreadcrumbList's own `flex-wrap`.
           * Wrapping is the wrong answer inside a fixed `h-14` header — it
           * doesn't make the trail fit, it spills it out of a row that
           * can't grow to hold it. */}
          <BreadcrumbList className="flex-nowrap">
            {crumbs.map((crumb, i) => (
              <Fragment key={crumb.label}>
                {i > 0 ? <BreadcrumbSeparator className="shrink-0" /> : null}
                {/* The linked ancestors keep their full labels and the
                 * current page is the one that gives way: "Overview" is a
                 * fixed short word, a repo id is arbitrarily long. */}
                <BreadcrumbItem className={crumb.href ? "shrink-0" : "min-w-0"}>
                  {crumb.href ? (
                    <BreadcrumbLink
                      href={crumb.href}
                      onClick={handleCrumbClick(crumb.href)}
                    >
                      {crumb.label}
                    </BreadcrumbLink>
                  ) : (
                    // `block`, because `truncate`'s overflow/text-overflow
                    // do nothing on the inline span BreadcrumbPage renders.
                    <BreadcrumbPage className="block truncate">
                      {crumb.label}
                    </BreadcrumbPage>
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
      {/* shrink-0 on both: they're what the breadcrumb yields space *to*.
       * Without it flex shrinks these instead, which at 414px wrapped
       * "Last 90 days" and "Sync now" onto two lines each inside a row
       * that's a fixed 14 units tall. */}
      <DateRangePicker
        className="shrink-0"
        size="sm"
        value={range}
        onValueChange={setRange}
        formatValue={formatRange}
        disabled={(date) => date > new Date()}
      />
      <Button
        className="shrink-0"
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
