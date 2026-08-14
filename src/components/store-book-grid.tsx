"use client";

import { useState } from "react";
import { BookDetailModal } from "@/components/book-detail-modal";
import { AddToLibraryButton } from "@/components/add-to-library-button";
import { AdminBookQuickControls } from "@/components/admin-book-panel";
import { BookCard } from "@/components/book-card";
import type { StoreBookCard } from "@/lib/store-query";

type StoreBookGridProps = {
  books: StoreBookCard[];
  inLibraryIds: string[];
  isAdmin?: boolean;
};

export function StoreBookGrid({
  books,
  inLibraryIds,
  isAdmin = false,
}: StoreBookGridProps) {
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const inLibrary = new Set(inLibraryIds);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {books.map((book, index) => (
          <div key={book.id} className="flex min-w-0 flex-col gap-2">
            <BookCard
              book={book}
              priority={index < 8}
              lazyCover={index >= 8}
              onSelect={() => setSelectedBookId(book.id)}
            />
            <AddToLibraryButton
              bookId={book.id}
              inLibrary={inLibrary.has(book.id)}
            />
            {isAdmin && <AdminBookQuickControls book={book} />}
          </div>
        ))}
      </div>

      {selectedBookId && (
        <BookDetailModal
          bookId={selectedBookId}
          onClose={() => setSelectedBookId(null)}
        />
      )}
    </>
  );
}
