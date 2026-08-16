import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { FilterChip } from "@/components/filter-chip";
import { SourceBrowseFilters } from "@/components/source-browse-filters";
import { SourceBrowseGrid } from "@/components/source-browse-grid";
import { SourceBrowsePagination } from "@/components/source-browse-pagination";
import { StoreBookSearch } from "@/components/store-book-search";
import { StoreSourceNav } from "@/components/store-source-nav";
import { sourceEngine } from "@/lib/reader/resolve";
import { requireUser } from "@/lib/session";
import {
  SOURCE_BROWSE_PAGE_SIZE,
  SOURCE_BROWSE_SORT_OPTIONS,
  parseSourceBrowseSort,
  sourceBrowseHref,
} from "@/lib/sources/browse";
import {
  annotateBrowseItems,
  getBrowsableSources,
  resolveBrowsableSource,
} from "@/lib/sources/browsable";
import { parseStorePage } from "@/lib/store-pagination";

export default async function SourceBrowsePage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{
    view?: string;
    q?: string;
    category?: string;
    page?: string;
  }>;
}) {
  const session = await requireUser();
  const { key } = await params;
  const {
    view: viewParam,
    q: qParam,
    category: categoryParam,
    page: pageParam,
  } = await searchParams;

  const [source, sources] = await Promise.all([
    resolveBrowsableSource(key),
    getBrowsableSources(),
  ]);
  if (!source) notFound();

  const engine = await sourceEngine(source.key);
  if (!engine?.browse) notFound();

  const hideAdult = session.user.hideAdultContent ?? true;
  const isAdmin = session.user.role === "ADMIN";
  const view = parseSourceBrowseSort(viewParam);
  const query = qParam?.trim() ?? "";
  const page = parseStorePage(pageParam);
  const categoryId = categoryParam?.trim() || undefined;

  const categories = engine.categories
    ? await engine.categories(hideAdult)
    : [];
  const validCategory = categoryId
    ? categories.find((category) => category.id === categoryId)
    : undefined;
  if (categoryId && !validCategory) {
    redirect(
      sourceBrowseHref(source.key, 1, {
        view: viewParam,
        q: query || undefined,
      }),
    );
  }

  let browseError: string | null = null;
  let items: Awaited<ReturnType<typeof annotateBrowseItems>> = [];
  let hasMore = false;
  let total: number | undefined;

  try {
    const result = await engine.browse({
      sort: view,
      query,
      categoryId: validCategory?.id,
      page,
      limit: SOURCE_BROWSE_PAGE_SIZE,
      hideAdult,
    });
    items = await annotateBrowseItems(
      hideAdult
        ? result.items.filter((item) => !item.isAdult)
        : result.items,
      session.user.id,
    );
    hasMore = result.hasMore;
    total = result.total;
  } catch (err) {
    browseError = err instanceof Error ? err.message : "Could not load titles";
  }

  const filterParams = {
    view: viewParam,
    q: query || undefined,
    category: validCategory?.id,
  };
  const selectedCategoryName = validCategory?.name;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-zinc-50">{source.name}</h1>
        <p className="mt-1 text-zinc-400">
          Browse live listings from {source.name}
          {query ? ` matching “${query}”` : ""}
          {selectedCategoryName ? ` in ${selectedCategoryName}` : ""}.
          {isAdmin
            ? " Add titles to the shared store so they can go into anyone’s library."
            : " Titles already in the store can be added to your library."}
        </p>
      </div>

      <StoreSourceNav sources={sources} activeKey={source.key} />

      <Suspense>
        <StoreBookSearch
          defaultValue={query}
          actionPath={`/library/add/source/${source.key}`}
          placeholder={`Search ${source.name}…`}
        />
      </Suspense>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-zinc-500">Show:</span>
        {SOURCE_BROWSE_SORT_OPTIONS.map((option) => (
          <FilterChip
            key={option.value}
            href={sourceBrowseHref(source.key, 1, {
              ...filterParams,
              view: option.value === "popular" ? undefined : option.value,
            })}
            active={view === option.value}
          >
            {option.label}
          </FilterChip>
        ))}
      </div>

      {categories.length > 0 && (
        <Suspense>
          <SourceBrowseFilters
            sourceKey={source.key}
            categories={categories}
            categoryId={validCategory?.id}
            view={viewParam}
          />
        </Suspense>
      )}

      {browseError ? (
        <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-12 text-center">
          <p className="text-zinc-400">{browseError}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-12 text-center">
          <p className="text-zinc-400">
            {query
              ? `No titles on ${source.name} match “${query}”.`
              : `No titles found on ${source.name}${selectedCategoryName ? ` in ${selectedCategoryName}` : ""}.`}
          </p>
        </div>
      ) : (
        <>
          <SourceBrowseGrid
            sourceKey={source.key}
            items={items}
            isAdmin={isAdmin}
            coverReferer={engine.imageReferer}
          />
          <SourceBrowsePagination
            sourceKey={source.key}
            page={page}
            hasMore={hasMore}
            total={total}
            view={viewParam}
            q={query || undefined}
            category={validCategory?.id}
            count={items.length}
          />
        </>
      )}
    </div>
  );
}
