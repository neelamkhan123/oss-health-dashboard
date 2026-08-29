import type { ReactNode } from "react";

/**
 * A sidebar group heading, with an optional count on the right. Not
 * `SidebarGroupLabel` when a count is present: that component renders a
 * plain label and has no slot for trailing content, and wrapping a flex row
 * inside it would fight its own text styling.
 */
export function GroupLabel({
  children,
  count,
}: {
  children: ReactNode;
  count?: number;
}) {
  return (
    <div className="flex items-center justify-between px-2 py-1 text-xs font-medium text-slate-500 dark:text-slate-400">
      <span>{children}</span>
      {count !== undefined ? (
        <span className="tabular-nums text-slate-400 dark:text-slate-500">
          {count}
        </span>
      ) : null}
    </div>
  );
}
