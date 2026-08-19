"use client";

import type { Book } from "@prisma/client";
import { ChevronDown, Shield } from "lucide-react";
import { useEffect, useRef } from "react";

import { AdminAdultToggle } from "@/components/admin-adult-toggle";
import { AdminBookForm } from "@/components/admin-book-form";
import { AdminCoverCorruptedToggle } from "@/components/admin-cover-corrupted-toggle";
import { AdminMigrateSource } from "@/components/admin-migrate-source";
import { AdminRepairCoverButton } from "@/components/admin-repair-cover-button";
import { AdminSyncMetadataButton } from "@/components/admin-sync-metadata-button";
import { DeleteBookButton } from "@/components/delete-book-button";

export function AdminBookPanel({
  book,
  onUpdated,
}: {
  book: Book;
  onUpdated?: () => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function openIfCatalogHash() {
      if (window.location.hash !== "#catalog") return;
      const el = detailsRef.current;
      if (!el) return;
      el.open = true;
    }

    openIfCatalogHash();
    window.addEventListener("hashchange", openIfCatalogHash);
    return () => window.removeEventListener("hashchange", openIfCatalogHash);
  }, []);

  return (
    <details
      ref={detailsRef}
      id="catalog"
      className="group rounded-xl border border-amber-900/40 bg-amber-950/15 p-5"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span className="space-y-1">
          <span className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-amber-200">
            <Shield className="h-4 w-4" />
            Catalog settings
          </span>
          <span className="block text-xs font-normal text-zinc-500">
            Admin only. Changes apply to the store listing for everyone.
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-amber-300/80 transition group-open:rotate-180" />
      </summary>

      <div className="mt-4 space-y-4">
        <div className="flex justify-end">
          <DeleteBookButton bookId={book.id} />
        </div>

        <AdminAdultToggle
          bookId={book.id}
          isAdult={book.isAdult}
          onUpdated={onUpdated}
        />
        <AdminCoverCorruptedToggle
          bookId={book.id}
          coverCorrupted={book.coverCorrupted}
          onUpdated={onUpdated}
        />
        <AdminRepairCoverButton book={book} onUpdated={onUpdated} />
        <AdminSyncMetadataButton book={book} onUpdated={onUpdated} />
        {book.category === "MANGA" && (
          <AdminMigrateSource
            bookId={book.id}
            bookTitle={book.title}
            sourceName={book.sourceName}
            onUpdated={onUpdated}
          />
        )}

        <details className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <summary className="cursor-pointer text-sm font-medium text-zinc-200">
            Edit catalog fields
          </summary>
          <div className="mt-4">
            <AdminBookForm book={book} embedded />
          </div>
        </details>
      </div>
    </details>
  );
}

export function AdminBookQuickControls({
  book,
  onUpdated,
}: {
  book: Pick<Book, "id" | "isAdult" | "coverCorrupted">;
  onUpdated?: () => void;
}) {
  return (
    <div className="grid min-w-0 grid-cols-2 items-center gap-x-2 gap-y-1 px-0.5">
      <AdminAdultToggle
        bookId={book.id}
        isAdult={book.isAdult}
        compact
        onUpdated={onUpdated}
      />
      <AdminCoverCorruptedToggle
        bookId={book.id}
        coverCorrupted={book.coverCorrupted}
        compact
        onUpdated={onUpdated}
      />
    </div>
  );
}
