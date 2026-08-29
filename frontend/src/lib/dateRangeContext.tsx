import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { defaultDateRangePresets, type DateRange } from "@neelamkhan21/ui";

const DEFAULT_PRESET = defaultDateRangePresets.find((preset) => preset.label === "Last 90 days")!;

type DateRangeContextValue = {
  range: DateRange;
  setRange: (range: DateRange) => void;
  /** `range` rounded to whole days — what the backend's `days` query param
   *  actually wants, rather than every consumer redoing this arithmetic. */
  days: number;
};

const DateRangeContext = createContext<DateRangeContextValue | null>(null);

/**
 * Backs the Topbar's date-range picker with state every page can read —
 * the picker itself lives in AppShell's shared Topbar, but Overview,
 * RepoDetail, and Compare are the ones that need to refetch when it
 * changes. A context, not prop-drilling through <Outlet>: AppShell renders
 * the picker and the pages that consume its value through completely
 * separate trees (Topbar vs. Outlet), so there's no single parent to pass
 * the value down from other than one that wraps both.
 */
export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [range, setRange] = useState<DateRange>(DEFAULT_PRESET.getRange());

  // +1, not just the raw millisecond difference: the library's own presets
  // are inclusive calendar ranges — "Last 7 days" is `{ from: today-6, to:
  // today }`, 7 calendar days apart but only 6*86_400_000ms apart, since
  // both ends are stripped to midnight. Without the +1, picking "Last 7
  // days" would send the backend `days=6` and every label on the page
  // would read "6 days" right next to a picker that says "Last 7 days".
  const days = useMemo(
    () => Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000) + 1),
    [range],
  );

  const value = useMemo(() => ({ range, setRange, days }), [range, days]);

  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>;
}

// react-refresh/only-export-components flags this: fast refresh treats a
// file as component-only for its special "no full reload" handling, and a
// hook export like this one defeats that. Accepted here rather than split
// into its own file — the hook is two lines and meaningless without the
// context it reads, so a losing Fast Refresh edge case beats the
// indirection of two files for one concept.
// eslint-disable-next-line react-refresh/only-export-components
export function useDateRange(): DateRangeContextValue {
  const ctx = useContext(DateRangeContext);
  if (!ctx) {
    throw new Error("useDateRange must be used within a DateRangeProvider");
  }
  return ctx;
}
