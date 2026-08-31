import { DateRangeProvider } from "../lib/dateRangeContext";
import { SyncProvider } from "../lib/syncContext";
import { TrackedReposProvider } from "../lib/trackedReposContext";
import { AppShell } from "./AppShell";

/** The providers that fetch authenticated data, plus the shell they feed.
 *  Rendered under RequireAuth so none of them mount — and none of their
 *  requests fire — until there's a session for those requests to use.
 *
 *  Lives here rather than in main.tsx for the same reason pages/lazy.tsx
 *  does: main.tsx renders the app and exports nothing, so a component
 *  declared there gives Fast Refresh no component boundary to track
 *  (react-refresh/only-export-components). */
export function ProtectedLayout() {
  return (
    <DateRangeProvider>
      <SyncProvider>
        <TrackedReposProvider>
          <AppShell />
        </TrackedReposProvider>
      </SyncProvider>
    </DateRangeProvider>
  );
}
