"use client";

import { useCallback, useState } from "react";

import { BookDetailModal } from "@/components/book-detail-modal";
import { AddToLibraryButton } from "@/components/add-to-library-button";
import { AdminBookQuickControls } from "@/components/admin-book-panel";
import { BookCard } from "@/components/book-card";
import { PagedInfiniteList } from "@/components/paged-infinite-list";
import type { StoreBookCard, StorePageResult } from "@/lib/store-query";
import { storePageHref } from "@/lib/store-query";

type StoreFilterParams = {
  category?: string;
  genre?: string;
  sort?: string;
  q?: string;
  content?: string;
  publication?: string;
};

type StoreBookGridProps = {
  books: StoreBookCard[];
  inLibraryIds: string[];
  isAdmin?: boolean;
  page: number;
  hasMore: boolean;
  filterParams: StoreFilterParams;
};

export function StoreBookGrid({
  books,
  inLibraryIds,
  isAdmin = false,
  page,
  hasMore,
  filterParams,
}: StoreBookGridProps) {
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [libraryIds, setLibraryIds] = useState(() => new Set(inLibraryIds));

  const fetchPage = useCallback(
    async (nextPage: number) => {
      const params = new URLSearchParams();
      if (filterParams.category) params.set("category", filterParams.category);
      if (filterParams.genre) params.set("genre", filterParams.genre);
      if (filterParams.sort) params.set("sort", filterParams.sort);
      if (filterParams.q) params.set("q", filterParams.q);
      if (filterParams.content) params.set("content", filterParams.content);
      if (filterParams.publication) {
        params.set("publication", filterParams.publication);
      }
      params.set("page", String(nextPage));

      const response = await fetch(`/api/store/books?${params}`);
      if (!response.ok) throw new Error("Failed to load store page");
      const data = (await response.json()) as StorePageResult;
      setLibraryIds((prev) => {
        const next = new Set(prev);
        for (const id of data.inLibraryIds) next.add(id);
        return next;
      });
      return { items: data.items, hasMore: data.hasMore };
    },
    [filterParams],
  );

  return (
    <>
      <PagedInfiniteList
        initialPage={page}
        initialItems={books}
        initialHasMore={hasMore}
        fetchPage={fetchPage}
        pageHref={(visiblePage) => storePageHref(visiblePage, filterParams)}
        renderPage={(pageItems, pageNumber) => (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {pageItems.map((book, index) => (
              <div key={book.id} className="flex min-w-0 flex-col gap-2">
                <BookCard
                  book={book}
                  priority={pageNumber === 1 && index < 8}
                  lazyCover={!(pageNumber === 1 && index < 8)}
                  onSelect={() => setSelectedBookId(book.id)}
                />
                <AddToLibraryButton
                  bookId={book.id}
                  inLibrary={libraryIds.has(book.id)}
                  onAdded={() =>
                    setLibraryIds((prev) => new Set(prev).add(book.id))
                  }
                />
                {isAdmin && <AdminBookQuickControls book={book} />}
              </div>
            ))}
          </div>
        )}
      />

      {selectedBookId && (
        <BookDetailModal
          bookId={selectedBookId}
          onClose={() => setSelectedBookId(null)}
        />
      )}
    </>
  );
}
