import { EmptyState, Card } from "@neelamkhan21/ui";
import { Inbox } from "lucide-react";

export function OverviewEmpty() {
  const steps = [
    [
      "1. Add a real GITHUB_TOKEN",
      "The sync job needs a Personal Access Token with public_repo scope in the backend's .env.",
    ],
    [
      "2. Trigger a sync",
      'docker compose exec api python -c "from app.services.sync import sync_all_repos; sync_all_repos.delay()"',
    ],
    [
      "3. Wait for it to finish",
      "A few minutes for a repo the size of react — check docker compose logs worker.",
    ],
  ];

  return (
    <div className="flex flex-col gap-6">
      <EmptyState
        icon={<Inbox size={20} />}
        title="No repositories synced yet"
        description="The tracked repos exist, but nothing has synced from GitHub yet — there's no mock data standing in for it anymore."
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
        {steps.map(([title, description]) => (
          <Card key={title} className="flex flex-col gap-1.5 p-5">
            <span className="text-sm font-medium text-slate-950 dark:text-white">
              {title}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {description}
            </span>
          </Card>
        ))}
      </div>
    </div>
  );
}
