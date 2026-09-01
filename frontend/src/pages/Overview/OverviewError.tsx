import { EmptyState, Button } from "neelam-ui";
import { TriangleAlert } from "lucide-react";

export function OverviewError({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={<TriangleAlert size={20} />}
      title="Couldn't load dashboard data"
      description="The API didn't respond — check that the backend (docker compose up) is running."
      action={
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      }
    />
  );
}
