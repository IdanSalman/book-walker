"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { Book, UserBook } from "@prisma/client";
import { useSession } from "next-auth/react";
import { X } from "lucide-react";

import { AddToLibraryButton } from "@/components/add-to-library-button";
import { AdminBookPanel } from "@/components/admin-book-panel";
import { CoverImage } from "@/components/cover-image";
import { StarsDisplay } from "@/components/stars";
import { UserBookForm } from "@/components/user-book-form";
import { OpenOnSourceLink } from "@/components/open-on-source-link";
import { Badge } from "@/components/ui/badge";
import { categoryLabel, categorySlug } from "@/lib/categories";
import {
  PUBLICATION_STATUS_LABELS,
  isOngoingPublication,
  pagesFieldLabel,
  pagesMetadataLabel,
} from "@/lib/publication";
import { genreStoreHref, storePageHref } from "@/lib/store-query";
import { isReadingSourceUrl } from "@/lib/reader/source-link";

type BookPreview = {
  book: Book;
  userBook: UserBook | null;
  ratingStats: {
    _avg: { rating: number | null };
    _count: { rating: number };
  };
  hidden: boolean;
};

export function BookDetailModal({
  bookId,
  onClose,
}: {
  bookId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<BookPreview | null>(null);
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const [, startRefresh] = useTransition();

  const loadBook = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHidden(false);
    try {
      const res = await fetch(`/api/books/${bookId}`);
      if (!res.ok) {
        throw new Error("Could not load book");
      }
      const json = (await res.json()) as BookPreview | { hidden: true };
      if ("hidden" in json && json.hidden) {
        setHidden(true);
        setData(null);
        return;
      }
      setData(json as BookPreview);
    } catch {
      setError("Could not load this title.");
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    void loadBook();
  }, [loadBook]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);

    const html = document.documentElement;
    const scrollY = window.scrollY;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyWidth = document.body.style.width;

    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      html.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.width = previousBodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, [onClose]);

  function handleLibraryChange() {
    startRefresh(() => {
      void loadBook();
    });
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 h-dvh w-full">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
      />
      <div
        className="relative flex h-full min-h-dvh items-center justify-center p-4"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="book-modal-title"
          className="flex max-h-[min(90dvh,calc(100dvh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
            <h2 id="book-modal-title" className="text-lg font-semibold text-zinc-100">
              Book details
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
            {loading ? (
              <p className="py-12 text-center text-zinc-400">Loading…</p>
            ) : error ? (
              <p className="py-12 text-center text-red-300">{error}</p>
            ) : hidden ? (
              <div className="space-y-3 py-8 text-center">
                <p className="text-zinc-300">This title is hidden by your preferences.</p>
                <Link
                  href="/account"
                  className="text-sm text-violet-400 hover:text-violet-300"
                  onClick={onClose}
                >
                  Change in account
                </Link>
              </div>
            ) : data ? (
              <BookDetailBody
                book={data.book}
                userBook={data.userBook}
                ratingStats={data.ratingStats}
                isAdmin={isAdmin}
                onClose={onClose}
                onLibraryChange={handleLibraryChange}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function BookDetailBody({
  book,
  userBook,
  ratingStats,
  isAdmin,
  onClose,
  onLibraryChange,
}: {
  book: Book;
  userBook: UserBook | null;
  ratingStats: BookPreview["ratingStats"];
  isAdmin: boolean;
  onClose: () => void;
  onLibraryChange: () => void;
}) {
  const avgRating = ratingStats._avg.rating;
  const ratingCount = ratingStats._count.rating;
  const categoryHref = storePageHref(1, {
    category: categorySlug(book.category),
  });

  return (
    <div className="grid gap-6 sm:grid-cols-[160px_1fr]">
      <div className="space-y-3">
        <div className="relative mx-auto aspect-[2/3] w-full max-w-[160px] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          <CoverImage
            src={book.coverUrl}
            alt={book.title}
            sizes="160px"
            priority
            size={512}
          />
        </div>
        <Link
          href={categoryHref}
          className="inline-block"
          onClick={onClose}
        >
          <Badge className="transition hover:border-violet-500 hover:bg-violet-950/50 hover:text-violet-200">
            {categoryLabel(book.category)}
          </Badge>
        </Link>
        {isReadingSourceUrl(book.sourceUrl) ? (
          <OpenOnSourceLink
            href={book.sourceUrl}
            sourceName={book.sourceName}
          />
        ) : null}
        {(book.category === "MANGA" || book.category === "LIGHT_NOVEL") &&
          book.publicationStatus !== "UNKNOWN" && (
            <Badge
              className={
                isOngoingPublication(book.publicationStatus)
                  ? "border-sky-900/50 bg-sky-950/50 text-sky-300"
                  : book.publicationStatus === "COMPLETED"
                    ? "border-emerald-900/50 bg-emerald-950/50 text-emerald-300"
                    : undefined
              }
            >
              {PUBLICATION_STATUS_LABELS[book.publicationStatus]}
            </Badge>
          )}
      </div>

      <div className="space-y-5">
        <h3 className="text-2xl font-bold text-zinc-50">{book.title}</h3>

        <dl className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 sm:grid-cols-2">
          <MetadataItem label={pagesFieldLabel(book.category)}>
            {pagesMetadataLabel(book)}
          </MetadataItem>

          {(book.category === "MANGA" || book.category === "LIGHT_NOVEL") &&
            book.publicationStatus !== "UNKNOWN" && (
              <MetadataItem label="Publication">
                {PUBLICATION_STATUS_LABELS[book.publicationStatus]}
              </MetadataItem>
            )}

          <MetadataItem label="Community rating">
            {ratingCount > 0 && avgRating != null ? (
              <div className="flex flex-wrap items-center gap-2">
                <StarsDisplay rating={avgRating} />
                <span className="text-sm text-zinc-400">
                  {avgRating.toFixed(1)} ({ratingCount})
                </span>
              </div>
            ) : (
              <span className="text-zinc-500">No ratings yet</span>
            )}
          </MetadataItem>

          {book.author && (
            <MetadataItem label="Author">{book.author}</MetadataItem>
          )}
          {book.artist && (
            <MetadataItem label="Artist">{book.artist}</MetadataItem>
          )}
          {book.sourceName && (
            <MetadataItem label="Source">
              {isReadingSourceUrl(book.sourceUrl) ? (
                <a
                  href={book.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-300 hover:text-violet-200"
                >
                  {book.sourceName}
                </a>
              ) : (
                book.sourceName
              )}
            </MetadataItem>
          )}

          {book.genres.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Genres
              </dt>
              <dd className="mt-2 flex flex-wrap gap-2">
                {book.genres.map((genre) => (
                  <Link
                    key={genre}
                    href={genreStoreHref(genre, {
                      category: categorySlug(book.category),
                    })}
                    onClick={onClose}
                  >
                    <Badge className="transition hover:border-violet-500 hover:bg-violet-950/50 hover:text-violet-200">
                      {genre}
                    </Badge>
                  </Link>
                ))}
              </dd>
            </div>
          )}
        </dl>

        <div className="space-y-2">
          <h4 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Summary
          </h4>
          <p className="whitespace-pre-wrap text-sm text-zinc-300">{book.summary}</p>
        </div>

        {isAdmin && (
          <AdminBookPanel book={book} onUpdated={onLibraryChange} />
        )}

        {userBook ? (
          <UserBookForm book={book} userBook={userBook} />
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="mb-3 text-sm text-zinc-400">
              Add this title to your library to track progress and rate it.
            </p>
            <AddToLibraryButton
              bookId={book.id}
              inLibrary={false}
              onAdded={onLibraryChange}
            />
          </div>
        )}

        <Link
          href={`/books/${book.id}`}
          className="inline-block text-sm text-violet-400 hover:text-violet-300"
          onClick={onClose}
        >
          Open full page
        </Link>
      </div>
    </div>
  );
}

function MetadataItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-zinc-200">{children}</dd>
    </div>
  );
}
