import { useEffect, useState } from "react";

type Result<T> = { key: string; status: "ready"; data: T } | { key: string; status: "error" };

/**
 * Fetches `fetcher()` whenever `key` changes, deriving "loading" from
 * whether the last *completed* fetch's key still matches the current one —
 * not a separate boolean flag reset with a synchronous `setState` at the
 * top of the effect. `react-hooks/set-state-in-effect` disallows exactly
 * that (a real correctness rule, not a false positive: a synchronous
 * setState in an effect body re-triggers a render synchronously within the
 * same commit, which is the cascading-render pattern React's own "you
 * might not need an effect" guidance warns about). This is the same
 * derive-don't-sync idiom RepoDetail's ContributorLeaderboard already used
 * for the same reason, pulled out so every fetch on this dashboard follows
 * it instead of three slightly different reimplementations.
 *
 * Call the returned `retry()` to force a refetch of the same key — from an
 * event handler, where a synchronous setState is completely fine.
 */
export function useFetch<T>(key: string, fetcher: () => Promise<T>) {
  const [result, setResult] = useState<Result<T> | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const compositeKey = `${key}:${reloadToken}`;

  useEffect(() => {
    fetcher()
      .then((data) => setResult({ key: compositeKey, status: "ready", data }))
      .catch(() => setResult({ key: compositeKey, status: "error" }));
    // fetcher is intentionally excluded: callers pass a fresh closure each
    // render, and keying the effect off its identity would defeat the
    // point of compositeKey (a stable dependency the caller controls).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compositeKey]);

  const isLoading = result?.key !== compositeKey;
  const isError = !isLoading && result?.status === "error";
  const data = !isLoading && result?.status === "ready" ? result.data : null;
  const retry = () => setReloadToken((t) => t + 1);

  return { isLoading, isError, data, retry };
}
