import { redirect } from "next/navigation";

import { BookCardSkeleton } from "@/components/book-card";
import { LibraryLiveResults } from "@/components/library-live-results";
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
  hideCaughtUp: boolean;
  librarySize: number;
  totalCount: number;
  totalCaughtUpCount: number;
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
  hideCaughtUp,
  librarySize,
  totalCount,
  totalCaughtUpCount,
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
  const initial = await fetchLibraryPage({
    userId,
    hideAdult,
    hideRead: hideCaughtUp,
    filterParams,
    sort,
    page: requestedPage,
  });

  if (requestedPage > initial.pageCount && initial.total > 0) {
    redirect(libraryPageHref({ ...filterParams, page: initial.pageCount }));
  }

  return (
    <LibraryLiveResults
      initial={initial}
      serverHideCaughtUp={hideCaughtUp}
      filterParams={filterParams}
      showEntryMeta={showEntryMeta}
      showAdminControls={showAdminControls}
      hideAdult={hideAdult}
      librarySize={librarySize}
      totalCount={totalCount}
      totalCaughtUpCount={totalCaughtUpCount}
      collectionLabel={collectionLabel}
      typeLabel={typeLabel}
      statusLabel={statusLabel}
      publicationLabel={publicationLabel}
      queryLabel={queryLabel}
    />
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
