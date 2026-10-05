"use client";

import Link from "next/link";
import { useCallback } from "react";
import { Play } from "lucide-react";

import { AdminBookQuickControls } from "@/components/admin-book-panel";
import { BookCard } from "@/components/book-card";
import { PagedInfiniteList } from "@/components/paged-infinite-list";
import { Badge } from "@/components/ui/badge";
import {
  libraryPageHref,
  type LibraryHrefParams,
  type LibraryPageResult,
  type LibraryUserBook,
} from "@/lib/library-query";
import { isReadableInApp } from "@/lib/reader/access";

function LibraryBookTile({
  userBook,
  index,
  showEntryMeta,
  showAdminControls,
}: {
  userBook: LibraryUserBook;
  index: number;
  showEntryMeta: boolean;
  showAdminControls: boolean;
}) {
  const readable = isReadableInApp(userBook.book.category);
  const continueLabel =
    userBook.currentPage > 0 ? "Continue reading" : "Start reading";

  return (
    <div className="relative flex h-full min-w-0 flex-col gap-2">
      <BookCard
        book={userBook.book}
        userBook={userBook}
        href={`/books/${userBook.bookId}`}
        priority={index < 8}
        lazyCover={index >= 8}
      />
      {readable && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 aspect-[2/3]">
          <Link
            href={`/read/${userBook.bookId}`}
            prefetch={false}
            aria-label={continueLabel}
            title={continueLabel}
            className="pointer-events-auto absolute bottom-2.5 right-2.5 flex size-11 items-center justify-center rounded-md bg-black/75 text-white shadow-lg backdrop-blur-sm transition hover:bg-violet-600"
          >
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </Link>
        </div>
      )}
      {showEntryMeta && (
        <div className="flex flex-wrap items-center gap-1 px-0.5">
          <Badge className="text-[10px]">
            {userBook.status.replaceAll("_", " ").toLowerCase()}
          </Badge>
          {userBook.categories.map((link) => (
            <Badge key={link.categoryId} className="text-[10px]">
              {link.category.name}
            </Badge>
          ))}
        </div>
      )}
      {showAdminControls && (
        <AdminBookQuickControls
          book={{
            id: userBook.book.id,
            isAdult: userBook.book.isAdult,
            coverCorrupted: userBook.book.coverCorrupted,
          }}
        />
      )}
    </div>
  );
}

export function LibraryBookGrid({
  items,
  page,
  hasMore,
  filterParams,
  showEntryMeta,
  showAdminControls,
}: {
  items: LibraryUserBook[];
  page: number;
  hasMore: boolean;
  filterParams: LibraryHrefParams;
  showEntryMeta: boolean;
  showAdminControls: boolean;
}) {
  const fetchPage = useCallback(
    async (nextPage: number) => {
      const params = new URLSearchParams();
      if (filterParams.collection) params.set("collection", filterParams.collection);
      if (filterParams.category) params.set("category", filterParams.category);
      if (filterParams.status) params.set("status", filterParams.status);
      if (filterParams.publication) {
        params.set("publication", filterParams.publication);
      }
      if (filterParams.q) params.set("q", filterParams.q);
      if (filterParams.sort) params.set("sort", filterParams.sort);
      params.set("page", String(nextPage));

      const response = await fetch(`/api/library/books?${params}`);
      if (!response.ok) throw new Error("Failed to load library page");
      const data = (await response.json()) as LibraryPageResult;
      return { items: data.items, hasMore: data.hasMore };
    },
    [filterParams],
  );

  return (
    <PagedInfiniteList
      resetKey={libraryPageHref({ ...filterParams, page })}
      initialPage={page}
      initialItems={items}
      initialHasMore={hasMore}
      fetchPage={fetchPage}
      pageHref={(visiblePage) => libraryPageHref({ ...filterParams, page: visiblePage })}
      renderPage={(pageItems, pageNumber) => (
        <div className="grid grid-cols-2 items-stretch gap-4 sm:grid-cols-3 md:grid-cols-4">
          {pageItems.map((userBook, index) => (
            <LibraryBookTile
              key={userBook.id}
              userBook={userBook}
              index={pageNumber === 1 ? index : index + 8}
              showEntryMeta={showEntryMeta}
              showAdminControls={showAdminControls}
            />
          ))}
        </div>
      )}
    />
  );
}
