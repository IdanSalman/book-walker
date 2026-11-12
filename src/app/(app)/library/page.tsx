import Link from "next/link";
import { cookies } from "next/headers";
import { Suspense } from "react";

import {
  LibraryCaughtUpProvider,
  LibraryCaughtUpToggle,
} from "@/components/library-caught-up-provider";
import { LibraryCollectionBar } from "@/components/library-collection-bar";
import { LibraryCollectionsManager } from "@/components/library-collections-manager";
import { LibraryFilters } from "@/components/library-filters";
import {
  LibraryGridSkeleton,
  LibraryResults,
} from "@/components/library-results";
import { StoreBookSearch } from "@/components/store-book-search";
import { CATEGORIES } from "@/lib/categories";
import {
  UNCATEGORIZED_NAME,
  UNCATEGORIZED_SLUG,
} from "@/lib/library-categories";
import {
  LIBRARY_HIDE_CAUGHT_UP_COOKIE,
  readHideCaughtUpCookie,
} from "@/lib/library-caught-up-view";
import { getLibraryNav } from "@/lib/library-nav";
import {
  libraryPageHref,
  parseLibrarySort,
  type LibraryHrefParams,
} from "@/lib/library-query";
import {
  PUBLICATION_STATUS_LABELS,
  parsePublicationFilter,
} from "@/lib/publication";
import { requireUser } from "@/lib/session";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{
    collection?: string;
    category?: string;
    status?: string;
    publication?: string;
    sort?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const session = await requireUser();
  const isAdmin = session.user.role === "ADMIN";
  const showAdminControls =
    isAdmin && Boolean(session.user.showLibraryAdminControls);
  const showEntryMeta = !isAdmin || showAdminControls;
  const hideAdult = session.user.hideAdultContent ?? true;
  const cookieStore = await cookies();
  const hideCaughtUp = readHideCaughtUpCookie(
    cookieStore.get(LIBRARY_HIDE_CAUGHT_UP_COOKIE)?.value,
  );
  const {
    collection: collectionParam,
    category: categoryParam,
    status,
    publication: publicationParam,
    sort: sortParam,
    q: qParam,
    page: pageParam,
  } = await searchParams;

  const query = qParam?.trim() ?? "";
  const selectedType = CATEGORIES.find((c) => c.slug === categoryParam);
  const sort = parseLibrarySort(sortParam);
  const publication = parsePublicationFilter(publicationParam);
  const showPublicationFilter =
    !selectedType ||
    selectedType.value === "MANGA" ||
    selectedType.value === "LIGHT_NOVEL";

  const nav = await getLibraryNav(session.user.id, hideAdult);

  const selectedCollection =
    collectionParam === UNCATEGORIZED_SLUG
      ? { slug: UNCATEGORIZED_SLUG, name: UNCATEGORIZED_NAME }
      : nav.categories.find((c) => c.slug === collectionParam);

  const filterParams: LibraryHrefParams = {
    collection: selectedCollection?.slug,
    category: categoryParam,
    status,
    publication: showPublicationFilter ? publicationParam : undefined,
    q: query || undefined,
    sort: sortParam,
  };

  const statusLabel = status
    ? status.replaceAll("_", " ").toLowerCase()
    : null;
  const publicationLabel = publication
    ? PUBLICATION_STATUS_LABELS[publication].toLowerCase()
    : null;

  const resultsKey = `${libraryPageHref(filterParams)}|caught:${hideCaughtUp ? "1" : "0"}`;

  return (
    <LibraryCaughtUpProvider initialHideCaughtUp={hideCaughtUp}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-zinc-50">My library</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <LibraryCaughtUpToggle />
            <Link
              href="/library/add"
              className="rounded-lg border border-violet-500/40 bg-violet-950/30 px-4 py-2 text-sm font-medium text-violet-200 transition hover:border-violet-400 hover:bg-violet-950/50"
            >
              Browse store
            </Link>
          </div>
        </div>

        <LibraryCollectionBar
          categories={nav.categories}
          uncategorizedCount={nav.uncategorizedCount}
          uncategorizedCaughtUpCount={nav.uncategorizedCaughtUpCount}
          totalCount={nav.totalCount}
          totalCaughtUpCount={nav.totalCaughtUpCount}
          selectedSlug={selectedCollection?.slug}
          filterParams={filterParams}
        />

        <LibraryCollectionsManager
          categories={nav.categories}
          currentSlug={
            selectedCollection?.slug === UNCATEGORIZED_SLUG
              ? undefined
              : selectedCollection?.slug
          }
          hrefParams={filterParams}
        />

        <Suspense>
          <StoreBookSearch
            defaultValue={query}
            actionPath="/library"
            placeholder="Search your library…"
          />
        </Suspense>

        <Suspense>
          <LibraryFilters
            category={categoryParam}
            status={status}
            publication={publicationParam}
            sort={sort}
            showPublicationFilter={showPublicationFilter}
          />
        </Suspense>

        <Suspense key={resultsKey} fallback={<LibraryGridSkeleton />}>
          <LibraryResults
            userId={session.user.id}
            showEntryMeta={showEntryMeta}
            showAdminControls={showAdminControls}
            hideAdult={hideAdult}
            hideCaughtUp={hideCaughtUp}
            librarySize={nav.librarySize}
            totalCount={nav.totalCount}
            totalCaughtUpCount={nav.totalCaughtUpCount}
            filterParams={filterParams}
            sort={sort}
            pageParam={pageParam}
            collectionLabel={selectedCollection?.name}
            typeLabel={selectedType?.label}
            statusLabel={statusLabel}
            publicationLabel={publicationLabel}
            queryLabel={query || undefined}
          />
        </Suspense>
      </div>
    </LibraryCaughtUpProvider>
  );
}
