import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  fetchMe,
  login as loginRequest,
  logout as logoutRequest,
  signup as signupRequest,
} from "./api";
import { useFetch } from "./useFetch";
import type { CurrentUser } from "./types.ts";

type AuthContextValue = {
  /** Null means signed out — but only once `isLoading` is false. */
  user: CurrentUser | null;
  /** True while /auth/me is in flight, including after a sign-in or sign-out
   *  bumps the version. Route guards must wait on this: treating the
   *  first-render null as "signed out" bounces a signed-in user to the login
   *  page on every refresh. */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const { data, isLoading } = useFetch(`auth-me:${version}`, fetchMe);

  const value = useMemo<AuthContextValue>(() => {
    const refresh = () => setVersion((v) => v + 1);
    return {
      user: data ?? null,
      isLoading,
      // Each of these bumps the version rather than storing the user the
      // request returned. It costs one extra call to /auth/me, and buys a
      // single source of truth: the cookie the browser is actually holding,
      // rather than a copy that can drift from it.
      login: async (email, password) => {
        await loginRequest(email, password);
        refresh();
      },
      signup: async (email, password) => {
        await signupRequest(email, password);
        refresh();
      },
      logout: async () => {
        await logoutRequest();
        refresh();
      },
    };
  }, [data, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Same disable as dateRangeContext and trackedReposContext: a hook this
// small isn't worth its own file just to satisfy Fast Refresh.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
