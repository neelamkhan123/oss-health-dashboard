import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { LazyOverview, LazyRepoDetail, LazyCompare } from "./pages/lazy";
import "./index.css";
import { reportWebVitals } from "./reportWebVitals";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<p className="p-6 text-sm text-slate-500 dark:text-slate-400">Loading…</p>}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<LazyOverview />} />
            <Route path="/repos/:repoId" element={<LazyRepoDetail />} />
            <Route path="/compare" element={<LazyCompare />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);

reportWebVitals();
