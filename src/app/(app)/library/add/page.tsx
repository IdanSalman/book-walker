import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { FilterChip } from "@/components/filter-chip";
import { StoreBookGrid } from "@/components/store-book-grid";
import { StoreBookSearch } from "@/components/store-book-search";
import { StoreFilters } from "@/components/store-filters";
import { StorePagination } from "@/components/store-pagination";
import { StoreSourceNav } from "@/components/store-source-nav";
import { CATEGORIES } from "@/lib/categories";
import { parseStoreContentFilter } from "@/lib/adult-content";
import {
  PUBLICATION_FILTER_OPTIONS,
  PUBLICATION_STATUS_LABELS,
  parsePublicationFilter,
} from "@/lib/publication";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getBrowsableSources } from "@/lib/sources/browsable";
import {
  parseStorePage,
  STORE_PAGE_SIZE,
  storePageCount,
  storePageHref,
} from "@/lib/store-pagination";
import {
  buildStoreWhere,
  fetchStoreBooks,
  getStoreGenres,
  parseStoreSort,
} from "@/lib/store-query";

export default async function BrowseStorePage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    genre?: string;
    sort?: string;
    q?: string;
    content?: string;
    publication?: string;
    page?: string;
  }>;
}) {
  const session = await requireUser();
  const {
    category: categoryParam,
    genre: genreParam,
    sort: sortParam,
    q: qParam,
    content: contentParam,
    publication: publicationParam,
    page: pageParam,
  } = await searchParams;

  const selected = CATEGORIES.find((c) => c.slug === categoryParam);
  const genre = genreParam?.trim() || undefined;
  const query = qParam?.trim() ?? "";
  const sort = parseStoreSort(sortParam);
  const hideAdult = session.user.hideAdultContent ?? true;
  const hideRead = session.user.hideReadTitles ?? false;
  const contentFilter = parseStoreContentFilter(contentParam, hideAdult);
  const contentUrl =
    contentFilter === "all" ? undefined : contentFilter;

  const categoryFilter = selected?.value;
  const publication = parsePublicationFilter(publicationParam);
  const showPublicationFilters =
    !categoryFilter || categoryFilter === "MANGA" || categoryFilter === "LIGHT_NOVEL";

  const genresPromise = getStoreGenres(contentFilter, {
    category: categoryFilter,
    userId: session.user.id,
    hideRead,
  });

  let validGenre: string | undefined;
  if (genre) {
    const genres = await genresPromise;
    validGenre = genres.some((g) => g.genre === genre) ? genre : undefined;
    if (!validGenre) {
      redirect(
        storePageHref(1, {
          category: categoryParam,
          sort: sortParam,
          q: query || undefined,
          content: contentUrl,
          publication: publicationParam,
        }),
      );
    }
  }

  const where = buildStoreWhere({
    category: categoryParam,
    genre: validGenre,
    hideAdult,
    hideRead,
    userId: session.user.id,
    content: contentUrl,
    publication: showPublicationFilters ? publicationParam : undefined,
    q: query,
  });

  const requestedPage = parseStorePage(pageParam);
  const [total, books, genres, sources] = await Promise.all([
    prisma.book.count({ where }),
    fetchStoreBooks(
      where,
      sort,
      (requestedPage - 1) * STORE_PAGE_SIZE,
      STORE_PAGE_SIZE,
    ),
    genresPromise,
    getBrowsableSources(),
  ]);
  const pageCount = storePageCount(total);
  const page = Math.min(requestedPage, pageCount);
  if (requestedPage > pageCount && total > 0) {
    redirect(
      storePageHref(pageCount, {
        category: categoryParam,
        genre: validGenre,
        sort: sortParam,
        q: query || undefined,
        content: contentUrl,
        publication: showPublicationFilters ? publicationParam : undefined,
      }),
    );
  }

  const libraryEntries =
    books.length === 0
      ? []
      : await prisma.userBook.findMany({
          where: {
            userId: session.user.id,
            bookId: { in: books.map((b) => b.id) },
          },
          select: { bookId: true },
        });

  const filterParams = {
    category: categoryParam,
    genre: validGenre,
    sort: sortParam,
    q: query || undefined,
    content: contentUrl,
    publication: showPublicationFilters ? publicationParam : undefined,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-zinc-50">Browse store</h1>
        <p className="mt-1 text-zinc-400">
          Add recognized titles to your personal library, or pick a source to
          browse live listings.
          {total > 0 && (
            <span className="ml-1 text-zinc-500">
              ({total.toLocaleString()} available
              {query ? ` matching “${query}”` : ""}
              {validGenre ? ` in ${validGenre}` : ""}
              {publication ? ` · ${PUBLICATION_STATUS_LABELS[publication].toLowerCase()}` : ""})
            </span>
          )}
        </p>
      </div>

      <StoreSourceNav sources={sources} />

      <Suspense>
        <StoreBookSearch defaultValue={query} />
      </Suspense>

      <div className="flex flex-wrap gap-2">
        <FilterChip
          href={storePageHref(1, { ...filterParams, category: undefined })}
          active={!selected}
        >
          All
        </FilterChip>
        {CATEGORIES.map((cat) => (
          <FilterChip
            key={cat.slug}
            href={storePageHref(1, { ...filterParams, category: cat.slug })}
            active={selected?.slug === cat.slug}
          >
            {cat.label}
          </FilterChip>
        ))}
      </div>

      {!hideAdult && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-zinc-500">Content:</span>
          <FilterChip
            href={storePageHref(1, { ...filterParams, content: undefined })}
            active={contentFilter === "all"}
          >
            All
          </FilterChip>
          <FilterChip
            href={storePageHref(1, { ...filterParams, content: "safe" })}
            active={contentFilter === "safe"}
          >
            Non-adult
          </FilterChip>
          <FilterChip
            href={storePageHref(1, { ...filterParams, content: "adult" })}
            active={contentFilter === "adult"}
          >
            Adult only
          </FilterChip>
        </div>
      )}

      {showPublicationFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-zinc-500">Publication:</span>
          <FilterChip
            href={storePageHref(1, { ...filterParams, publication: undefined })}
            active={!publication}
          >
            All
          </FilterChip>
          {PUBLICATION_FILTER_OPTIONS.map((option) => (
            <FilterChip
              key={option.value}
              href={storePageHref(1, {
                ...filterParams,
                publication: option.value,
              })}
              active={publication === option.value}
            >
              {option.label}
            </FilterChip>
          ))}
        </div>
      )}

      <Suspense>
        <StoreFilters
          genres={genres}
          genre={validGenre}
          sort={sort}
          publication={publicationParam}
          showPublicationFilter={showPublicationFilters}
        />
      </Suspense>

      {books.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-12 text-center">
          <p className="text-zinc-400">
            {query
              ? `No books match “${query}”.`
              : `No books in the store yet${selected ? ` for ${selected.label}` : ""}${validGenre ? ` in genre “${validGenre}”` : ""}.`}
          </p>
          {hideAdult && (
            <p className="mt-2 text-sm text-zinc-500">
              Adult content is hidden.{" "}
              <Link href="/account" className="text-violet-400 hover:text-violet-300">
                Change in account
              </Link>
            </p>
          )}
          {hideRead && (
            <p className="mt-2 text-sm text-zinc-500">
              Completed titles are hidden.{" "}
              <Link href="/account" className="text-violet-400 hover:text-violet-300">
                Change in account
              </Link>
            </p>
          )}
          {session.user.role === "ADMIN" && !query && (
            <Link
              href="/admin/books/new"
              className="mt-2 inline-block text-sm text-violet-400 hover:text-violet-300"
            >
              Add the first book as admin
            </Link>
          )}
        </div>
      ) : (
        <>
          <StoreBookGrid
            books={books}
            inLibraryIds={libraryEntries.map((e) => e.bookId)}
            isAdmin={session.user.role === "ADMIN"}
          />
          <StorePagination
            total={total}
            page={page}
            category={categoryParam}
            genre={validGenre}
            sort={sort}
            q={query || undefined}
            content={contentUrl}
            publication={showPublicationFilters ? publicationParam : undefined}
          />
        </>
      )}
    </div>
  );
}
