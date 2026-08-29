import { useState } from "react";
import {
  Card,
  DataTable,
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  getPaginationRange,
  type DataTablePaginationState,
  type DataTableProps,
} from "@neelamkhan21/ui";

export interface StyledDataTableProps<T> extends DataTableProps<T> {
  /** Extra classes for the wrapping Card, e.g. to add margin. */
  className?: string;
}

/**
 * The house style for every data table in this app: light gray header
 * background, a bit more header row padding, a hairline under the header,
 * the whole thing edge-to-edge in its own card rather than inset inside
 * one with padding, and its pagination footer (once there's more than one
 * page) as a separate, centered element below the card rather than
 * bundled inside it.
 *
 * `DataTable` itself exposes no header-styling prop, and `DataTableColumn`'s
 * own `className` reaches the body cells too (same field, both call
 * sites) — an arbitrary-variant descendant selector scoped to the
 * card is what actually hits only the header, without a
 * component-library change. It also naturally out-specifies
 * `TableHead`'s own hardcoded `h-10 px-3` (a two-element compound
 * selector beats a single utility class on specificity), so this
 * wins regardless of which order Tailwind happens to emit either
 * rule in — no `!important` needed.
 *
 * `overflow-hidden`, not rounding the row/cells themselves: a `<tr>`'s
 * background doesn't reliably clip to a border-radius the way a normal
 * box does (that's what made the header's square corners poke past the
 * card's rounded edge before this existed), and rounding only the outer
 * header cells' corners individually is exactly the kind of
 * per-cell-fragile fix that breaks the next time a column is added or
 * reordered. Clipping the whole card to its own already-rounded shape is
 * the one fix that doesn't care what's inside it.
 *
 * Defaults `pageSize` to 10 rather than leaving `DataTable`'s own
 * unpaginated default in place: every table in this app renders real,
 * unbounded server data (a busy repo's contributor list runs well past a
 * hundred rows), and pagination only renders at all once there's more
 * than one page — so a table with 10 rows or fewer looks identical to
 * today, and one with 90 doesn't dump every row on screen at once. Still
 * overridable per call site, same as any other prop here.
 *
 * The footer itself is built from the same `Pagination`/`getPaginationRange`
 * pieces `DataTable`'s own built-in one uses (see its `hidePagination`/
 * `onPaginationChange` docs) — this isn't a second implementation, just
 * the identical markup rendered as a sibling of the Card instead of a
 * descendant, which is the only way to get it visually outside the
 * card's border/background at all: a card's own bordered, rounded,
 * `overflow-hidden` box can't be escaped by a CSS override on a child
 * still living inside it, however that child is styled.
 */
export function StyledDataTable<T>({ className, pageSize = 10, ...tableProps }: StyledDataTableProps<T>) {
  const [pagination, setPagination] = useState<DataTablePaginationState | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <Card
        className={[
          "overflow-hidden",
          "[&_thead_th]:whitespace-nowrap [&_thead_th]:bg-slate-50 [&_thead_th]:py-3",
          "[&_thead_th]:border-b [&_thead_th]:border-slate-200",
          "dark:[&_thead_th]:bg-slate-900 dark:[&_thead_th]:border-slate-800",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <DataTable pageSize={pageSize} hidePagination onPaginationChange={setPagination} {...tableProps} />
      </Card>

      {pagination && pagination.totalPages > 1 ? (
        <Pagination>
          <PaginationContent className="justify-center">
            <PaginationItem>
              <PaginationPrevious
                disabled={pagination.page === 1}
                onClick={() => pagination.setPage(Math.max(1, pagination.page - 1))}
              />
            </PaginationItem>
            {getPaginationRange({ currentPage: pagination.page, totalPages: pagination.totalPages }).map((item, index) =>
              item === "ellipsis" ? (
                <PaginationItem key={`ellipsis-${index}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={item}>
                  <PaginationLink
                    isActive={item === pagination.page}
                    onClick={() => pagination.setPage(item)}
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                disabled={pagination.page === pagination.totalPages}
                onClick={() => pagination.setPage(Math.min(pagination.totalPages, pagination.page + 1))}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </div>
  );
}
