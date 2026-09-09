import Link from "next/link";
import { redirect } from "next/navigation";

import { BookCardSkeleton } from "@/components/book-card";
import { LibraryBookGrid } from "@/components/library-book-grid";
import {
  fetchLibraryPage,
  libraryPageHref,
  type LibraryHrefParams,
  type LibrarySort,
} from "@/lib/library-query";
import { parseLibraryPage } from "@/lib/library-pagination";

type LibraryResultsProps = {
  userId: string;
  showEntryMeta: boolean;
  showAdminControls: boolean;
  hideAdult: boolean;
  hideRead: boolean;
  librarySize: number;
  totalCount: number;
  filterParams: LibraryHrefParams;
  sort: LibrarySort;
  pageParam?: string;
  collectionLabel?: string;
  typeLabel?: string;
  statusLabel?: string | null;
  publicationLabel?: string | null;
  queryLabel?: string;
};

export async function LibraryResults({
  userId,
  showEntryMeta,
  showAdminControls,
  hideAdult,
  hideRead,
  librarySize,
  totalCount,
  filterParams,
  sort,
  pageParam,
  collectionLabel,
  typeLabel,
  statusLabel,
  publicationLabel,
  queryLabel,
}: LibraryResultsProps) {
  const requestedPage = parseLibraryPage(pageParam);
  const { items, total: filteredCount, page, pageCount, hasMore } =
    await fetchLibraryPage({
      userId,
      hideAdult,
      hideRead,
      filterParams,
      sort,
      page: requestedPage,
    });

  if (requestedPage > pageCount && filteredCount > 0) {
    redirect(libraryPageHref({ ...filterParams, page: pageCount }));
  }

  if (filteredCount === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-12 text-center">
        <p className="text-zinc-400">
          {librarySize === 0
            ? "Your library is empty."
            : hideAdult && hideRead && totalCount === 0
              ? "Adult titles and titles with no new chapters are hidden."
              : hideAdult && totalCount === 0
                ? "Adult titles are hidden."
                : hideRead && totalCount === 0
                  ? "Titles with no new chapters are hidden."
                  : queryLabel
                    ? `No titles match “${queryLabel}”.`
                    : "No titles match these filters."}
        </p>
        {(hideAdult || hideRead) && librarySize > 0 && totalCount === 0 ? (
          <Link
            href="/account"
            className="mt-2 inline-block text-sm text-violet-400 hover:text-violet-300"
          >
            Change in account
          </Link>
        ) : (
          <Link
            href={
              librarySize === 0
                ? "/library/add"
                : libraryPageHref({ ...filterParams, q: undefined })
            }
            className="mt-2 inline-block text-sm text-violet-400 hover:text-violet-300"
          >
            {librarySize === 0
              ? "Browse the store"
              : queryLabel
                ? "Clear search"
                : "Clear filters"}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-zinc-400">
        {filteredCount.toLocaleString()} title
        {filteredCount === 1 ? "" : "s"}
        {collectionLabel ? ` in ${collectionLabel}` : ""}
        {typeLabel ? ` · ${typeLabel}` : ""}
        {statusLabel ? ` · ${statusLabel}` : ""}
        {publicationLabel ? ` · ${publicationLabel}` : ""}
        {queryLabel ? ` matching “${queryLabel}”` : ""}
        {totalCount > 0 && filteredCount !== totalCount && (
          <span className="text-zinc-500">
            {" "}
            ({totalCount.toLocaleString()} total)
          </span>
        )}
      </p>

      <LibraryBookGrid
        items={items}
        page={page}
        hasMore={hasMore}
        filterParams={filterParams}
        showEntryMeta={showEntryMeta}
        showAdminControls={showAdminControls}
      />
    </div>
  );
}

export function LibraryGridSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-5 w-48 animate-pulse rounded bg-zinc-800" />
      <div className="grid grid-cols-2 items-start gap-4 sm:grid-cols-3 md:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <BookCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
