import { useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  DropdownMenuTrigger,
  toast,
} from "neelam-ui";
import { MoreHorizontal, Pin, PinOff, Trash2 } from "lucide-react";
import { removeTrackedRepo, setRepoPinned } from "../lib/api";
import { useTrackedRepos } from "../lib/trackedReposContext";
import type { TrackedRepo } from "../lib/types";

/**
 * The two things you can do to a repo *as a tracked entry* rather than as a
 * page — pin it to the top of the sidebar, or stop tracking it — as one
 * menu, shared by the sidebar list and the repo-detail heading so the two
 * can't drift apart.
 *
 * One menu, up to three ways in. `DropdownMenu` *is* `ContextMenu` in this
 * library (see its source — same provider, same content, same items), and
 * `DropdownMenuTrigger` just opens it against a button's rect instead of at
 * the cursor. So the dots button lives inside the same `ContextMenu` as the
 * right-click target rather than being a parallel `DropdownMenu` with its
 * own copy of the items.
 *
 * `children` is the right-click surface, wrapped in a `<div>` — the sidebar
 * hands over its whole nav row, and the heading passes nothing at all,
 * since a `<div>` can't sit inside an `<h1>` (phrasing content only) and
 * right-clicking a page title isn't a place anyone looks for a menu anyway.
 */
export function RepoActionsMenu({
  repo,
  children,
  triggerClassName,
  buttonClassName,
}: {
  repo: TrackedRepo;
  /** Right-click target. Omit for a dots-button-only menu. */
  children?: ReactNode;
  /** On the `<div>` wrapping `children` — ignored when there are none. */
  triggerClassName?: string;
  /** On the dots button itself. */
  buttonClassName?: string;
}) {
  const { refresh } = useTrackedRepos();
  const location = useLocation();
  const navigate = useNavigate();
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const repoPath = `/repos/${encodeURIComponent(repo.fullName)}`;

  const handleTogglePin = async () => {
    const pinned = !repo.pinned;
    try {
      await setRepoPinned(repo.fullName, pinned);
      refresh();
    } catch (err) {
      toast({
        title: pinned ? "Couldn't pin this repository" : "Couldn't unpin this repository",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      await removeTrackedRepo(repo.fullName);
      toast({
        title: "Repository removed",
        description: `${repo.fullName} is no longer tracked.`,
        variant: "success",
      });
      // Removing whatever you're currently looking at would otherwise leave
      // the detail page sitting on a repo that's no longer in the list,
      // refetching a 404 on its next key change — and from the heading's own
      // menu, that page is always the one being removed.
      if (location.pathname === repoPath) navigate("/", { replace: true });
      refresh();
      setConfirmingRemove(false);
    } catch (err) {
      toast({
        title: "Couldn't remove this repository",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setIsRemoving(false);
    }
  };

  const dotsButton = (
    <DropdownMenuTrigger
      aria-label={`Actions for ${repo.fullName}`}
      className={buttonClassName}
    >
      <MoreHorizontal size={14} aria-hidden="true" />
    </DropdownMenuTrigger>
  );

  return (
    <>
      <ContextMenu>
        {children ? (
          <ContextMenuTrigger className={triggerClassName}>
            {children}
            {dotsButton}
          </ContextMenuTrigger>
        ) : (
          dotsButton
        )}
        <ContextMenuContent>
          <ContextMenuItem onClick={handleTogglePin}>
            {repo.pinned ? <PinOff size={14} /> : <Pin size={14} />}
            {repo.pinned ? "Unpin" : "Pin to top"}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onClick={() => setConfirmingRemove(true)}
          >
            <Trash2 size={14} />
            Remove
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Confirmed rather than immediate: in the sidebar the menu item sits
       * one click away from a link the user hits constantly, and a mis-aimed
       * right-click shouldn't be able to silently drop a repo out of the
       * list. */}
      <AlertDialog open={confirmingRemove} onOpenChange={setConfirmingRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {repo.fullName}?</AlertDialogTitle>
            <AlertDialogDescription>
              It'll disappear from your sidebar, Overview, and Compare. Its
              synced history is kept, so adding it back later is instant.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isRemoving}
              // The dialog closes itself on action by default (its onClick
              // wrapper calls onOpenChange(false) unless the event was
              // defaultPrevented); here it has to stay up until the request
              // actually comes back, so a failure can be reported against
              // the thing it failed on rather than into an empty screen.
              onClick={(e) => {
                e.preventDefault();
                handleRemove();
              }}
            >
              {isRemoving ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** The dots button's own styling, shared by both callers so the two render
 *  as the same control. The sidebar layers its hover-reveal rules on top;
 *  next to the heading it's simply always shown. */
export const REPO_ACTIONS_BUTTON_CLASS =
  "flex size-6 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-950 focus-visible:outline-none focus-visible:shadow-[rgba(15,23,42,0.08)_0px_0px_0px_3px,rgba(15,23,42,0.16)_0px_0px_12px_2px] dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white dark:focus-visible:shadow-[rgba(255,255,255,0.1)_0px_0px_0px_3px,rgba(255,255,255,0.2)_0px_0px_12px_2px]";
