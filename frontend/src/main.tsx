import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@neelamkhan21/ui";
import { AppShell } from "./layout/AppShell";
import { RequireAuth } from "./components/RequireAuth.tsx";
import {
  LazyOverview,
  LazyRepoDetail,
  LazyCompare,
  LazyLogin,
} from "./pages/lazy";
import { AuthProvider } from "./lib/authContext";
import { DateRangeProvider } from "./lib/dateRangeContext";
import { SyncProvider } from "./lib/syncContext";
import { TrackedReposProvider } from "./lib/trackedReposContext";
import "./index.css";
import { reportWebVitals } from "./reportWebVitals";

/** The providers that fetch authenticated data, plus the shell they feed.
 *  Kept behind RequireAuth so none of them mount — and none of their
 *  requests fire — until there's a session for those requests to use. */
function ProtectedLayout() {
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      {/* Outside the routes: both the login page and the guard read it. */}
      <AuthProvider>
        <Suspense
          fallback={
            <p className="p-6 text-sm text-slate-500 dark:text-slate-400">
              Loading…
            </p>
          }
        >
          <Routes>
            <Route path="/login" element={<LazyLogin />} />
            <Route element={<RequireAuth />}>
              <Route element={<ProtectedLayout />}>
                <Route path="/" element={<LazyOverview />} />
                <Route path="/repos/:repoId" element={<LazyRepoDetail />} />
                <Route path="/compare" element={<LazyCompare />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </AuthProvider>
      {/* Mounted once, outside the route tree so it survives navigation —
       * a "Sync started" toast fired from the Topbar shouldn't vanish just
       * because the click that triggered it also happened to change routes. */}
      <Toaster />
    </BrowserRouter>
  </StrictMode>,
);

reportWebVitals();
