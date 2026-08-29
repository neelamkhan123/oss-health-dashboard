import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@neelamkhan21/ui";
import { AppShell } from "./layout/AppShell";
import { LazyOverview, LazyRepoDetail, LazyCompare } from "./pages/lazy";
import { DateRangeProvider } from "./lib/dateRangeContext";
import { SyncProvider } from "./lib/syncContext";
import { TrackedReposProvider } from "./lib/trackedReposContext";
import "./index.css";
import { reportWebVitals } from "./reportWebVitals";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <DateRangeProvider>
        <SyncProvider>
          <TrackedReposProvider>
            <Suspense fallback={<p className="p-6 text-sm text-slate-500 dark:text-slate-400">Loading…</p>}>
              <Routes>
                <Route element={<AppShell />}>
                  <Route path="/" element={<LazyOverview />} />
                  <Route path="/repos/:repoId" element={<LazyRepoDetail />} />
                  <Route path="/compare" element={<LazyCompare />} />
                </Route>
              </Routes>
            </Suspense>
          </TrackedReposProvider>
        </SyncProvider>
      </DateRangeProvider>
      {/* Mounted once, outside the route tree so it survives navigation —
       * a "Sync started" toast fired from the Topbar shouldn't vanish just
       * because the click that triggered it also happened to change routes. */}
      <Toaster />
    </BrowserRouter>
  </StrictMode>,
);

reportWebVitals();
