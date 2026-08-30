import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/authContext";

/** A layout route: anything nested under it renders only for a signed-in
 *  user. Everyone else is sent to /login. */
export function RequireAuth() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  // Must come before the null check. On a hard refresh the cookie is still
  // valid but /auth/me hasn't answered yet, so `user` is briefly null —
  // redirecting on that would sign people out on every page load.
  if (isLoading) {
    return (
      <p className="p-6 text-sm text-slate-500 dark:text-slate-400">Loading…</p>
    );
  }

  if (!user) {
    // `replace` keeps the guarded URL out of history, so Back from the
    // login page doesn't bounce straight back here. `state` carries where
    // they were going so Login can return them after signing in.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
