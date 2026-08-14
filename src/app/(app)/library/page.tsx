import Link from "next/link";
import { Suspense } from "react";

import { LibraryCollectionsManager } from "@/components/library-collections-manager";
import { LibraryFilters } from "@/components/library-filters";
import {
  LibraryGridSkeleton,
  LibraryResults,
} from "@/components/library-results";
import { CATEGORIES } from "@/lib/categories";
import {
  UNCATEGORIZED_NAME,
  UNCATEGORIZED_SLUG,
} from "@/lib/library-categories";
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
    page?: string;
  }>;
}) {
  const session = await requireUser();
  const isAdmin = session.user.role === "ADMIN";
  const hideAdult = session.user.hideAdultContent ?? true;
  const {
    collection: collectionParam,
    category: categoryParam,
    status,
    publication: publicationParam,
    sort: sortParam,
    page: pageParam,
  } = await searchParams;

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
    sort: sortParam,
  };

  const statusLabel = status
    ? status.replaceAll("_", " ").toLowerCase()
    : null;
  const publicationLabel = publication
    ? PUBLICATION_STATUS_LABELS[publication].toLowerCase()
    : null;

  const resultsKey = libraryPageHref({
    ...filterParams,
    page: Number.parseInt(pageParam ?? "1", 10) || 1,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-50">My library</h1>
        </div>
        <Link
          href="/library/add"
          className="rounded-lg border border-violet-500/40 bg-violet-950/30 px-4 py-2 text-sm font-medium text-violet-200 transition hover:border-violet-400 hover:bg-violet-950/50"
        >
          Browse store
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterChip
          href={libraryPageHref({ ...filterParams, collection: undefined })}
          active={!selectedCollection}
        >
          All
          <ChipCount>{nav.totalCount}</ChipCount>
        </FilterChip>
        {nav.categories.map((cat) => (
          <FilterChip
            key={cat.id}
            href={libraryPageHref({ ...filterParams, collection: cat.slug })}
            active={selectedCollection?.slug === cat.slug}
          >
            {cat.name}
            <ChipCount>{cat.count}</ChipCount>
          </FilterChip>
        ))}
        {nav.uncategorizedCount > 0 && (
          <FilterChip
            href={libraryPageHref({
              ...filterParams,
              collection: UNCATEGORIZED_SLUG,
            })}
            active={selectedCollection?.slug === UNCATEGORIZED_SLUG}
          >
            {UNCATEGORIZED_NAME}
            <ChipCount>{nav.uncategorizedCount}</ChipCount>
          </FilterChip>
        )}
      </div>

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
          isAdmin={isAdmin}
          hideAdult={hideAdult}
          librarySize={nav.librarySize}
          totalCount={nav.totalCount}
          filterParams={filterParams}
          sort={sort}
          pageParam={pageParam}
          collectionLabel={selectedCollection?.name}
          typeLabel={selectedType?.label}
          statusLabel={statusLabel}
          publicationLabel={publicationLabel}
        />
      </Suspense>
    </div>
  );
}

function ChipCount({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] opacity-70">{children}</span>;
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      prefetch
      className={
        active
          ? "inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-3 py-1.5 text-sm font-medium text-white"
          : "inline-flex items-center gap-1.5 rounded-full border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200"
      }
    >
      {children}
    </Link>
  );
}
