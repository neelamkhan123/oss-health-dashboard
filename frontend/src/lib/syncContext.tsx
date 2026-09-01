import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { toast } from "neelam-ui";
import { fetchSyncStatus, stopSync as apiStopSync, triggerSync } from "./api";
import type { SyncStatus } from "./types";

type SyncPhase = "idle" | "starting" | "syncing";

type SyncContextValue = {
  phase: SyncPhase;
  /** Bumped once each time a sync finishes. Include it in a page's
   *  `useFetch` key (alongside `days`) so a sync that completes while that
   *  page is open refetches it automatically, on top of the backend's own
   *  cache invalidation — without this, a stale response already sitting
   *  in that page's `useFetch` state would sit there until the next
   *  unrelated refetch. */
  version: number;
  runSync: () => void;
};

const SyncContext = createContext<SyncContextValue | null>(null);

// Chosen to match sync.py's own estimate ("a few minutes per repo") with
// headroom: 2s between checks is frequent enough to feel live without
// hammering the API, and 300 attempts covers ~10 minutes before this gives
// up and lets the user know rather than polling forever.
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 300;

// One toast, updated in place for the whole run (start → progress →
// outcome) via `toast`'s id-reuse — not a new toast per tick, which would
// stack a fresh notification every 2 seconds.
const SYNC_TOAST_ID = "sync-progress";

/**
 * Two effects, one per phase transition, rather than one hand-rolled
 * recursive poll loop stored on a ref: `runSync` only ever flips `phase`,
 * and each effect owns exactly one async step (fire the POST; then poll
 * until done), with its cleanup as the single place that cancels a
 * stale in-flight request. That split is what keeps a fast unmount (or a
 * second click) from resolving into stale state — there's no ref holding
 * a closure that could still be "current" after the phase it was created
 * for has already moved on.
 *
 * The progress toast (numbers + a Stop button) lives entirely in here,
 * not in a component: it's driven by the same two effects that already
 * own the network calls, so there's one place — not a component plus a
 * context plus a toast call scattered across them — that knows the full
 * lifecycle of one sync run.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<SyncPhase>("idle");
  const [version, setVersion] = useState(0);

  // Phase 1: fire the POST that queues the job.
  useEffect(() => {
    if (phase !== "starting") return;
    let cancelled = false;

    toast({
      id: SYNC_TOAST_ID,
      title: "Starting sync…",
      description: "Queuing the latest data pull from GitHub.",
      duration: Infinity, // pinned until the run finishes or errors — see the poll effect
    });

    triggerSync()
      .then(() => {
        if (!cancelled) setPhase("syncing");
      })
      .catch(() => {
        if (cancelled) return;
        setPhase("idle");
        toast({
          id: SYNC_TOAST_ID,
          title: "Couldn't start sync",
          description: "The API didn't respond — check that the backend (docker compose up) is running.",
          variant: "destructive",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [phase]);

  // Phase 2: poll GET /sync/status until it reports "complete", updating
  // the toast with real numbers and a Stop button on every tick.
  useEffect(() => {
    if (phase !== "syncing") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const describe = (s: SyncStatus) => {
      const names = Object.keys(s.repos);
      const settled = Object.values(s.repos).filter((o) => o === "done" || o === "failed" || o === "cancelled").length;
      return { total: names.length, settled };
    };

    const requestStop = () => {
      apiStopSync().catch(() => {
        toast({
          id: SYNC_TOAST_ID,
          title: "Couldn't stop sync",
          description: "The API didn't respond — the sync is still running in the background.",
          variant: "destructive",
        });
      });
      // No optimistic toast update here: the next poll tick (at most
      // POLL_INTERVAL_MS away) picks up the now-"cancelled" repos and
      // renders the real outcome, rather than this guessing at it.
    };

    const tick = () => {
      attempts += 1;
      fetchSyncStatus()
        .then((s) => {
          if (cancelled) return;

          // "idle" is included here, not just "running": right after the
          // POST that queued the job, the worker may not have picked it up
          // yet, so the status endpoint can briefly still report "idle"
          // (nothing started) rather than "running" — that's still "keep
          // waiting", not "nothing happened".
          if (s.state !== "complete") {
            if (attempts >= MAX_POLL_ATTEMPTS) {
              setPhase("idle");
              toast({
                id: SYNC_TOAST_ID,
                title: "Still syncing",
                description:
                  "This is taking longer than expected — check `docker compose logs worker` for progress.",
                variant: "destructive",
              });
              return;
            }
            const { total, settled } = describe(s);
            toast({
              id: SYNC_TOAST_ID,
              title: "Syncing repositories…",
              description:
                s.state === "idle"
                  ? "Waiting for the worker to pick up the job…"
                  : `${settled} of ${total} repos synced.`,
              duration: Infinity,
              action: { label: "Stop", onClick: requestStop },
            });
            timer = setTimeout(tick, POLL_INTERVAL_MS);
            return;
          }

          setPhase("idle");
          setVersion((v) => v + 1);
          const outcomes = Object.values(s.repos);
          const failed = outcomes.filter((o) => o === "failed").length;
          const stopped = outcomes.filter((o) => o === "cancelled").length;
          const title = stopped ? "Sync stopped" : failed ? "Sync finished with errors" : "Sync complete";
          const description = stopped
            ? `Stopped after ${outcomes.length - stopped} of ${outcomes.length} repos finished.`
            : failed
              ? `${failed} of ${outcomes.length} repos failed — check \`docker compose logs worker\`.`
              : "The latest data from GitHub is up to date.";
          toast({
            id: SYNC_TOAST_ID,
            title,
            description,
            variant: failed || stopped ? "destructive" : "success",
          });
        })
        .catch(() => {
          if (cancelled) return;
          setPhase("idle");
          toast({
            id: SYNC_TOAST_ID,
            title: "Lost track of sync progress",
            description: "The status check failed — the sync may still be running in the background.",
            variant: "destructive",
          });
        });
    };
    tick();

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [phase]);

  const runSync = useCallback(() => {
    // No-op if a sync is already in flight — Button's own `loading` prop
    // disables the click too, this is just a defensive backstop.
    setPhase((current) => (current === "idle" ? "starting" : current));
  }, []);

  return <SyncContext.Provider value={{ phase, version, runSync }}>{children}</SyncContext.Provider>;
}

// See dateRangeContext.tsx's identical disable: a hook this small isn't
// worth splitting into its own file just to satisfy Fast Refresh.
// eslint-disable-next-line react-refresh/only-export-components
export function useSyncStatus(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error("useSyncStatus must be used within a SyncProvider");
  }
  return ctx;
}
