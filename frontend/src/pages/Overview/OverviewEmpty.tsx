import { EmptyState } from "@neelamkhan21/ui";
import { Inbox } from "lucide-react";
import { AddRepositoryInline } from "./AddRepositoryInline";

/**
 * Shown when *this account* isn't tracking anything — the common case for
 * any brand-new signup, not just a fresh install: repos are tracked per
 * user (Part 11.2), so a second person signing in to an already-populated
 * dashboard lands here too, same as the very first user ever did. Embeds
 * the same "Add a repository" form the populated Overview shows below its
 * KPI cards, so there's always a way out of this screen without leaving
 * the page — this used to dead-end into terminal commands (`docker compose
 * exec api python -c "..."`) that assumed the only way anything could ever
 * get tracked was a developer seeding the whole app, back when tracking
 * was global instead of per-account.
 */
export function OverviewEmpty() {
  return (
    <EmptyState
      icon={<Inbox size={20} />}
      title="You're not tracking any repositories yet"
      description="Add a public GitHub repository below to start seeing its health metrics — syncing begins as soon as it's added."
    >
      <div className="mt-4 w-full max-w-md text-left">
        <AddRepositoryInline />
      </div>
    </EmptyState>
  );
}
