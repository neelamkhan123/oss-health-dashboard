import { useState, type FormEvent } from "react";
import { Input, Button, toast } from "@neelamkhan21/ui";
import { addTrackedRepo } from "../../lib/api";
import { useTrackedRepos } from "../../lib/trackedReposContext";

/**
 * Tracks a new public GitHub repo — its own row between the KPI cards and
 * the tracked-repositories table, not folded into either. No dialog: a
 * single field doesn't need a modal in the way, and there's room for it
 * directly on the page now that the trend chart (see git history) no
 * longer sits above the table. Its data starts syncing as soon as the
 * backend confirms the repo actually exists.
 */
export function AddRepositoryInline() {
  const { refresh } = useTrackedRepos();
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = fullName.trim();
    if (!trimmed) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await addTrackedRepo(trimmed);
      toast({
        title: "Repository added",
        description: `${trimmed} is now tracked — syncing its data now.`,
        variant: "success",
      });
      refresh();
      setFullName("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't add this repository.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col flex-wrap gap-2">
      <div className="flex flex-col gap-1.5">
        <h2 className="m-0 font-semibold text-slate-950 dark:text-white">
          Add a repository
        </h2>
        <p className="m-0 text-xs text-slate-500 dark:text-slate-400">
          Any public GitHub repository — starts syncing as soon as it's added.
        </p>
      </div>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col md:flex-row items-center gap-2 lg:w-1/2"
      >
        <Input
          aria-label="Repository to track (owner/repo)"
          placeholder="owner/repo"
          value={fullName}
          onChange={(e) => {
            setFullName(e.target.value);
            if (error) setError(null);
          }}
          className="h-8 text-xs"
        />
        <Button
          type="submit"
          size="md"
          loading={isSubmitting}
          disabled={!fullName.trim()}
          className="w-full md:w-auto"
        >
          Add
        </Button>
        {error ? (
          <p className="w-full text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
