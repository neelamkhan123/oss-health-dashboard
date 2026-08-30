import type { ReactNode } from "react";

export function PageHeader({
  title,
  titleActions,
  description,
  actions,
}: {
  title: ReactNode;
  /** Rendered beside the title itself, not out with `actions` — for a
   *  control that acts on the thing the title names (the repo's own menu)
   *  rather than on the page. A sibling of the `<h1>` rather than part of
   *  it: `<h1>` takes phrasing content, and these are buttons and popovers. */
  titleActions?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <h1 className="m-0 text-2xl leading-tight font-semibold tracking-tight text-slate-950 dark:text-white">
            {title}
          </h1>
          {titleActions}
        </div>
        {description ? (
          <p className="m-0 text-sm text-slate-500 dark:text-slate-400">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
