import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Theme } from "./types";

const STORAGE_KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

interface ThemeContextValue {
  /** What the user picked — including "system", i.e. "no preference". */
  theme: Theme;
  /** What that resolves to right now — never "system" — for anything that
   *  needs an actual light/dark answer (an icon, an aria-pressed state)
   *  rather than the three-way choice itself. */
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Owns the light/dark/system choice, persists it, and keeps the `.dark`
 *  class on `<html>` in sync — that class, not this context, is what every
 *  `dark:` utility in the app actually reacts to (see index.css's
 *  `@custom-variant dark`). Reading `localStorage` directly in the
 *  initializer, rather than defaulting to "system" and correcting in an
 *  effect, avoids a render where `theme` briefly disagrees with the class
 *  index.html's inline script already applied before React ever ran. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system"
      ? stored
      : "system";
  });

  // Tracks the OS setting on its own, independent of `theme` — it's only
  // ever written from the matchMedia "change" callback below, so it stays
  // accurate live (flipping your OS to dark mode with the tab open still
  // repaints it) without `resolvedTheme` itself needing to be state that
  // some effect re-derives and pushes on every `theme` change.
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia(DARK_QUERY).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(DARK_QUERY);
    const handleChange = (e: MediaQueryListEvent) =>
      setSystemPrefersDark(e.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  const resolvedTheme: "light" | "dark" =
    theme === "system" ? (systemPrefersDark ? "dark" : "light") : theme;

  const setTheme = (next: Theme) => {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  }, [resolvedTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Same disable as authContext/dateRangeContext/trackedReposContext: a hook
// this small isn't worth its own file just to satisfy Fast Refresh.
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
