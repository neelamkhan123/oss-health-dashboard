import {
  SidebarMenuItem,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@neelamkhan21/ui";
import { Folder, Pin } from "lucide-react";
import {
  RepoActionsMenu,
  REPO_ACTIONS_BUTTON_CLASS,
} from "../../components/RepoActionsMenu";
import type { TrackedRepo } from "../../lib/types";
import { SidebarNavButton } from "./SidebarNavButton";

/**
 * One repo in the sidebar's "Tracked repos" group. The actions themselves
 * live in RepoActionsMenu, shared with the repo-detail heading; what's here
 * is how that menu attaches to a nav row — the whole row is the right-click
 * surface, and the dots button is revealed on hover over it.
 *
 * Pinned repos swap the folder icon for a pin, so the reordering above has
 * a visible cause rather than looking like the list shuffled itself.
 */
export function RepoNavItem({ repo }: { repo: TrackedRepo }) {
  return (
    <SidebarMenuItem>
      <RepoActionsMenu
        repo={repo}
        triggerClassName="group/repo relative"
        // Hover-revealed on desktop, always visible below `lg` — the same
        // breakpoint the shell switches the sidebar to an overlay at, and
        // the point past which there's no hover to reveal anything with.
        // `aria-expanded:` keeps it up while its own menu is open (the
        // trigger sets that attribute itself), so the button doesn't vanish
        // out from under the menu it just opened once the pointer moves off
        // the row. Still tab-reachable at opacity-0, which is what gives the
        // menu a keyboard path at all.
        buttonClassName={`${REPO_ACTIONS_BUTTON_CLASS} absolute top-1/2 right-1 -translate-y-1/2 opacity-0 transition-opacity focus-visible:opacity-100 aria-expanded:opacity-100 group-hover/repo:opacity-100 max-lg:opacity-100`}
      >
        <Tooltip side="right">
          <TooltipTrigger>
            <SidebarNavButton
              to={`/repos/${encodeURIComponent(repo.fullName)}`}
              // Reserves the dots' column so a repo name never runs under it.
              className="pr-7"
              icon={
                repo.pinned ? (
                  <Pin size={16} className="fill-current" />
                ) : (
                  <Folder
                size={16}
                className="fill-[var(--accent-soft)] text-[var(--accent-soft)]"
              />
                )
              }
            >
              <span className="truncate">{repo.fullName}</span>
            </SidebarNavButton>
          </TooltipTrigger>
          <TooltipContent>{repo.fullName}</TooltipContent>
        </Tooltip>
      </RepoActionsMenu>
    </SidebarMenuItem>
  );
}
