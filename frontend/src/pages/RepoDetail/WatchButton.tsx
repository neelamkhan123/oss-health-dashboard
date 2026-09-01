import { useEffect, useState } from "react";
import { Button, toast } from "neelam-ui";
import { Eye, EyeOff } from "lucide-react";
import { fetchWatchStatus, watchRepo, unwatchRepo } from "../../lib/api";

/**
 * Reflects and toggles whether GITHUB_TOKEN's own account is watching this
 * repo on GitHub — a real subscription (see the backend's watch_repo/
 * unwatch_repo), not anything local to this app. `Eye`/`EyeOff`, not the
 * `Star` icon this used to render: GitHub itself keeps "Star" and "Watch"
 * as two separate actions with two separate icons, and this button has
 * only ever been the watch one.
 *
 * Own component rather than inline in RepoDetail: it owns its own
 * fetch-on-mount and in-flight state, the same reasoning as
 * ContributorLeaderboard's independent contributors fetch.
 */
export function WatchButton({ repoId }: { repoId: string }) {
  // Tagged with the repo it was fetched for, same reasoning as
  // ContributorLeaderboard's own `fetched` state: comparing IDs at read
  // time (rather than an effect resetting state on prop change, which
  // trips react-hooks/set-state-in-effect) is what keeps a repo switch
  // from briefly showing the *previous* repo's watch state as this one's.
  const [fetched, setFetched] = useState<{ repoId: string; watching: boolean } | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  // null = not confirmed yet (still loading, hasn't loaded for this repo,
  // or the check failed) — the button reads as "Watch" in that case rather
  // than guessing, since claiming either state without confirmation could
  // be wrong in either direction.
  const watching = fetched?.repoId === repoId ? fetched.watching : null;

  useEffect(() => {
    let cancelled = false;
    fetchWatchStatus(repoId)
      .then((status) => {
        if (!cancelled) setFetched({ repoId, watching: status.watching });
      })
      .catch(() => {
        // Left unset — see `watching`'s own comment above.
      });
    return () => {
      cancelled = true;
    };
  }, [repoId]);

  const toggle = async () => {
    setIsToggling(true);
    try {
      const next = watching ? await unwatchRepo(repoId) : await watchRepo(repoId);
      setFetched({ repoId, watching: next.watching });
    } catch (err) {
      toast({
        title: watching ? "Couldn't unwatch this repository" : "Couldn't watch this repository",
        description:
          err instanceof Error ? err.message : "Something went wrong talking to GitHub.",
        variant: "destructive",
      });
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      icon={watching ? <EyeOff size={14} /> : <Eye size={14} />}
      loading={isToggling}
      onClick={toggle}
    >
      {watching ? "Watching" : "Watch"}
    </Button>
  );
}
