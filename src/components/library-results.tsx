import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminBookQuickControls } from "@/components/admin-book-panel";
import { BookCard, BookCardSkeleton } from "@/components/book-card";
import { LibraryPagination } from "@/components/library-pagination";
import { Badge } from "@/components/ui/badge";
import {
  buildLibraryWhere,
  libraryOrderBy,
  libraryPageHref,
  LIBRARY_USER_BOOK_SELECT,
  type LibraryHrefParams,
  type LibrarySort,
} from "@/lib/library-query";
import {
  LIBRARY_PAGE_SIZE,
  libraryPageCount,
  parseLibraryPage,
} from "@/lib/library-pagination";
import { prisma } from "@/lib/prisma";
import { isReadableComic } from "@/lib/reader/access";

type LibraryResultsProps = {
  userId: string;
  isAdmin: boolean;
  hideAdult: boolean;
  librarySize: number;
  totalCount: number;
  filterParams: LibraryHrefParams;
  sort: LibrarySort;
  pageParam?: string;
  collectionLabel?: string;
  typeLabel?: string;
  statusLabel?: string | null;
  publicationLabel?: string | null;
};

export async function LibraryResults({
  userId,
  isAdmin,
  hideAdult,
  librarySize,
  totalCount,
  filterParams,
  sort,
  pageParam,
  collectionLabel,
  typeLabel,
  statusLabel,
  publicationLabel,
}: LibraryResultsProps) {
  const where = buildLibraryWhere(userId, {
    collection: filterParams.collection,
    category: filterParams.category,
    status: filterParams.status,
    publication: filterParams.publication,
    hideAdult,
  });

  const requestedPage = parseLibraryPage(pageParam);
  const [filteredCount, userBooks] = await Promise.all([
    prisma.userBook.count({ where }),
    prisma.userBook.findMany({
      where,
      select: LIBRARY_USER_BOOK_SELECT,
      orderBy: libraryOrderBy(sort),
      skip: (requestedPage - 1) * LIBRARY_PAGE_SIZE,
      take: LIBRARY_PAGE_SIZE,
    }),
  ]);

  const pageCount = libraryPageCount(filteredCount);
  if (requestedPage > pageCount && filteredCount > 0) {
    redirect(libraryPageHref({ ...filterParams, page: pageCount }));
  }

  const page = Math.min(requestedPage, pageCount);

  if (filteredCount === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-12 text-center">
        <p className="text-zinc-400">
          {librarySize === 0
            ? "Your library is empty."
            : hideAdult && totalCount === 0
              ? "Adult titles are hidden."
              : "No titles match these filters."}
        </p>
        {hideAdult && librarySize > 0 && totalCount === 0 ? (
          <Link
            href="/account"
            className="mt-2 inline-block text-sm text-violet-400 hover:text-violet-300"
          >
            Change in account
          </Link>
        ) : (
          <Link
            href={librarySize === 0 ? "/library/add" : "/library"}
            className="mt-2 inline-block text-sm text-violet-400 hover:text-violet-300"
          >
            {librarySize === 0 ? "Browse the store" : "Clear filters"}
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
        {totalCount > 0 && filteredCount !== totalCount && (
          <span className="text-zinc-500">
            {" "}
            ({totalCount.toLocaleString()} total)
          </span>
        )}
      </p>

      <div className="grid grid-cols-2 items-start gap-4 sm:grid-cols-3 md:grid-cols-4">
        {userBooks.map((ub, index) => (
          <div key={ub.id} className="flex min-w-0 flex-col gap-2">
            <BookCard
              book={ub.book}
              userBook={ub}
              href={`/books/${ub.bookId}`}
              priority={index < 8}
              lazyCover={index >= 8}
            />
            <div className="flex flex-wrap items-center gap-1 px-0.5">
              <Badge className="text-[10px]">
                {ub.status.replaceAll("_", " ").toLowerCase()}
              </Badge>
              {ub.categories.map((link) => (
                <Badge key={link.categoryId} className="text-[10px]">
                  {link.category.name}
                </Badge>
              ))}
              {isReadableComic(ub.book.category) && (
                <Link
                  href={`/read/${ub.bookId}`}
                  prefetch={false}
                  className="rounded-full border border-violet-800/60 bg-violet-950/40 px-2 py-0.5 text-[10px] font-medium text-violet-200 transition hover:border-violet-500 hover:bg-violet-950/70"
                >
                  Read
                </Link>
              )}
            </div>
            {isAdmin && (
              <AdminBookQuickControls
                book={{
                  id: ub.book.id,
                  isAdult: ub.book.isAdult,
                  coverCorrupted: ub.book.coverCorrupted,
                }}
              />
            )}
          </div>
        ))}
      </div>

      <LibraryPagination
        total={filteredCount}
        page={page}
        {...filterParams}
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
