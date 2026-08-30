import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Accent, Theme } from "./types";
import { DEFAULT_ACCENT, isAccent } from "./accents";

const STORAGE_KEY = "theme";
const ACCENT_STORAGE_KEY = "accent";
const DARK_QUERY = "(prefers-color-scheme: dark)";

interface ThemeContextValue {
  /** What the user picked — including "system", i.e. "no preference". */
  theme: Theme;
  /** What that resolves to right now — never "system" — for anything that
   *  needs an actual light/dark answer (an icon, an aria-pressed state)
   *  rather than the three-way choice itself. */
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
  /** The accent hue, applied as `data-accent` on `<html>` — see index.css
   *  for what it drives. Orthogonal to light/dark: every accent defines a
   *  value for both, and the two choices are persisted separately. */
  accent: Accent;
  setAccent: (accent: Accent) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Owns both appearance choices — light/dark/system and the accent hue —
 *  persists them, and keeps `<html>`'s `.dark` class and `data-accent`
 *  attribute in sync. Those two markers on the root element, not this
 *  context, are what the styles actually react to (see index.css's
 *  `@custom-variant dark` and its `[data-accent]` blocks); the context just
 *  drives them and gives the account menu something to render against.
 *  One provider for both because they're the same kind of thing: a stored
 *  preference that resolves to a root-element marker.
 *
 *  Reading `localStorage` directly in the initializers, rather than
 *  defaulting and correcting in an effect, avoids a render where the state
 *  briefly disagrees with what index.html's inline script already applied
 *  before React ever ran. */
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

  const [accent, setAccentState] = useState<Accent>(() => {
    const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
    return isAccent(stored) ? stored : DEFAULT_ACCENT;
  });

  const setAccent = (next: Accent) => {
    setAccentState(next);
    localStorage.setItem(ACCENT_STORAGE_KEY, next);
  };

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  }, [resolvedTheme]);

  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);

  return (
    <ThemeContext.Provider
      value={{ theme, resolvedTheme, setTheme, accent, setAccent }}
    >
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
