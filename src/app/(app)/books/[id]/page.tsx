import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AddToLibraryButton } from "@/components/add-to-library-button";
import { AdminBookPanel } from "@/components/admin-book-panel";
import { CoverImage } from "@/components/cover-image";
import { ReadableChapterSection } from "@/components/readable-chapter-section";
import { StarsDisplay } from "@/components/stars";
import { UserBookForm } from "@/components/user-book-form";
import { OpenOnSourceLink } from "@/components/open-on-source-link";
import { Badge } from "@/components/ui/badge";
import { categoryLabel, categorySlug } from "@/lib/categories";
import { shouldHideAdultBook } from "@/lib/adult-content";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isReadableComic } from "@/lib/reader/access";
import { isReadingSourceUrl } from "@/lib/reader/source-link";
import { genreStoreHref, storePageHref } from "@/lib/store-query";
import {
  PUBLICATION_STATUS_LABELS,
  isOngoingPublication,
  pagesFieldLabel,
  pagesMetadataLabel,
} from "@/lib/publication";

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireUser();
  const hideAdult = session.user.hideAdultContent ?? true;

  const book = await prisma.book.findUnique({ where: { id } });
  if (!book) notFound();

  const [userBook, ratingStats, libraryCategories] = await Promise.all([
    prisma.userBook.findUnique({
      where: {
        userId_bookId: {
          userId: session.user.id,
          bookId: id,
        },
      },
      include: { categories: { select: { categoryId: true } } },
    }),
    prisma.userBook.aggregate({
      where: { bookId: id, rating: { not: null } },
      _avg: { rating: true },
      _count: { rating: true },
    }),
    prisma.libraryCategory.findMany({
      where: { userId: session.user.id },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (shouldHideAdultBook(hideAdult, book.isAdult)) {
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-12 text-center">
        <h1 className="text-xl font-semibold text-zinc-100">Content hidden</h1>
        <p className="text-zinc-400">
          This title is hidden by your adult content preference.
        </p>
        <Link
          href="/account"
          className="inline-block text-sm text-violet-400 hover:text-violet-300"
        >
          Change in account
        </Link>
      </div>
    );
  }

  const avgRating = ratingStats._avg.rating;
  const ratingCount = ratingStats._count.rating;
  const isAdmin = session.user.role === "ADMIN";
  const categoryHref = storePageHref(1, {
    category: categorySlug(book.category),
  });

  return (
    <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
      <div className="space-y-4">
        <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          <CoverImage
            src={book.coverUrl}
            alt={book.title}
            sizes="240px"
            priority
            size={512}
          />
        </div>
        {isReadingSourceUrl(book.sourceUrl) ? (
          <OpenOnSourceLink
            href={book.sourceUrl}
            sourceName={book.sourceName}
          />
        ) : null}
        <Link href={categoryHref} className="inline-block">
          <Badge className="transition hover:border-violet-500 hover:bg-violet-950/50 hover:text-violet-200">
            {categoryLabel(book.category)}
          </Badge>
        </Link>
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

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-50">{book.title}</h1>
          {isAdmin && (
            <a
              href="#catalog"
              className="mt-2 inline-block text-sm text-amber-300 hover:text-amber-200"
            >
              Catalog settings
            </a>
          )}
        </div>

        <dl className="grid gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 sm:grid-cols-2">
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
                  {avgRating.toFixed(1)} ({ratingCount}{" "}
                  {ratingCount === 1 ? "rating" : "ratings"})
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
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Summary
          </h2>
          <p className="whitespace-pre-wrap text-zinc-300">{book.summary}</p>
        </div>

        {isAdmin && <AdminBookPanel book={book} />}

        {userBook ? (
          <UserBookForm
            book={book}
            userBook={userBook}
            libraryCategories={libraryCategories}
            selectedCategoryIds={userBook.categories.map((link) => link.categoryId)}
          />
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <p className="mb-4 text-sm text-zinc-400">
              Add this title to your library to track progress and rate it.
            </p>
            <AddToLibraryButton bookId={book.id} inLibrary={false} />
          </div>
        )}

        {userBook && isReadableComic(book.category) && (
          <Suspense
            fallback={
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-400">
                Loading chapters…
              </div>
            }
          >
            <ReadableChapterSection
              book={book}
              currentPage={userBook.currentPage}
            />
          </Suspense>
        )}
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
