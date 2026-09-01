import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "neelam-ui";
import { ProtectedLayout } from "./layout/ProtectedLayout";
import { RequireAuth } from "./components/RequireAuth.tsx";
import {
  LazyOverview,
  LazyRepoDetail,
  LazyCompare,
  LazyLogin,
} from "./pages/lazy";
import { AuthProvider } from "./lib/authContext";
import { ThemeProvider } from "./lib/themeContext";
import "./index.css";
import { reportWebVitals } from "./reportWebVitals";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Outermost: applies before anything else renders, and covers both
     * the login page and the authenticated app alike. */}
    <ThemeProvider>
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
    </ThemeProvider>
  </StrictMode>,
);

reportWebVitals();
