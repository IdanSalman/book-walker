import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import type { Prisma } from "@prisma/client";

import { AdminAdultContentToggle } from "@/components/admin-adult-content-toggle";
import { AdminAdultToggle } from "@/components/admin-adult-toggle";
import { AdminBookSearch } from "@/components/admin-book-search";
import { AdminCorruptedCoversToggle } from "@/components/admin-corrupted-covers-toggle";
import { AdminCoverCorruptedToggle } from "@/components/admin-cover-corrupted-toggle";
import { AdminFilters } from "@/components/admin-filters";
import { AdminPagination } from "@/components/admin-pagination";
import { AdminScanCoversButtons } from "@/components/admin-scan-covers-button";
import { AdminSyncOngoingButtons } from "@/components/admin-sync-ongoing-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  adminPageCount,
  ADMIN_PAGE_SIZE,
  parseAdminPage,
} from "@/lib/admin-pagination";
import { categoryLabel } from "@/lib/categories";
import { coverDisplayUrl } from "@/lib/cover-url";
import {
  PUBLICATION_STATUS_LABELS,
  pageCountLabel,
  parsePublicationFilter,
} from "@/lib/publication";
import { hideAdultBookFilter } from "@/lib/adult-content";
import { prisma } from "@/lib/prisma";
import {
  fetchStoreBooks,
  getStoreGenres,
  parseStoreSort,
} from "@/lib/store-query";

export default async function AdminBooksPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    hideAdult?: string;
    genre?: string;
    sort?: string;
    corruptedCovers?: string;
    publication?: string;
  }>;
}) {
  const {
    page: pageParam,
    q,
    hideAdult: hideAdultParam,
    genre: genreParam,
    sort: sortParam,
    corruptedCovers: corruptedCoversParam,
    publication: publicationParam,
  } = await searchParams;
  const query = q?.trim() ?? "";
  const hideAdult = hideAdultParam === "1" || hideAdultParam === "true";
  const showCorrupted =
    corruptedCoversParam === "1" || corruptedCoversParam === "true";
  const genre = genreParam?.trim() || undefined;
  const sort = parseStoreSort(sortParam);
  const publication = parsePublicationFilter(publicationParam);

  const where: Prisma.BookWhereInput = {
    ...hideAdultBookFilter(hideAdult),
    ...(showCorrupted ? { coverCorrupted: true } : {}),
    ...(genre ? { genres: { has: genre } } : {}),
    ...(publication ? { publicationStatus: publication } : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { artist: { contains: query, mode: "insensitive" } },
            { author: { contains: query, mode: "insensitive" } },
            { sourceName: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, genres, corruptedCount] = await Promise.all([
    prisma.book.count({ where }),
    getStoreGenres(),
    prisma.book.count({ where: { coverCorrupted: true } }),
  ]);
  const totalPages = adminPageCount(total);
  const page = Math.min(parseAdminPage(pageParam), totalPages);

  const books = await fetchStoreBooks(
    where,
    sort,
    (page - 1) * ADMIN_PAGE_SIZE,
    ADMIN_PAGE_SIZE,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-zinc-50">Catalog</h1>
          <p className="mt-1 text-zinc-400">
            {total.toLocaleString()} book{total === 1 ? "" : "s"}
            {showCorrupted ? " with corrupted covers" : " in the store"}
            {genre ? ` in genre “${genre}”` : ""}
            {publication ? ` · ${PUBLICATION_STATUS_LABELS[publication].toLowerCase()}` : ""}.
            {corruptedCount > 0 && !showCorrupted && (
              <span className="text-zinc-500">
                {" "}
                ({corruptedCount.toLocaleString()} flagged)
              </span>
            )}
          </p>
        </div>
        <Link href="/admin/books/new">
          <Button>Add book</Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-stretch gap-4">
        <Suspense>
          <AdminBookSearch defaultValue={query} />
        </Suspense>
        <Suspense>
          <AdminAdultContentToggle hideAdult={hideAdult} />
        </Suspense>
        <Suspense>
          <AdminCorruptedCoversToggle showCorrupted={showCorrupted} />
        </Suspense>
      </div>

      <Suspense>
        <AdminFilters
          genres={genres}
          genre={genre}
          sort={sort}
          publication={publicationParam}
        />
      </Suspense>

      <AdminScanCoversButtons bookIds={books.map((book) => book.id)} />
      <AdminSyncOngoingButtons bookIds={books.map((book) => book.id)} />

      {books.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-12 text-center">
          <p className="text-zinc-400">
            {showCorrupted
              ? "No corrupted covers flagged yet. Scan a page of books to detect broken PNGs."
              : query
                ? "No books match your search."
                : hideAdult
                  ? "No non-adult books in the catalog."
                  : genre
                    ? `No books in genre “${genre}”.`
                    : "The catalog is empty."}
          </p>
          {!query && !hideAdult && !genre && !showCorrupted && (
            <Link
              href="/admin/books/new"
              className="mt-2 inline-block text-sm text-violet-400 hover:text-violet-300"
            >
              Add the first book
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900 text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Book</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">
                    Artist
                  </th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">
                    Type
                  </th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">
                    Chapters
                  </th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">
                    Status
                  </th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">
                    Store cover
                  </th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">
                    Adult
                  </th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {books.map((book) => (
                  <tr key={book.id} className="bg-zinc-950/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="relative h-12 w-8 shrink-0 overflow-hidden rounded bg-zinc-800">
                          <Image
                            src={coverDisplayUrl(book.coverUrl, 256)}
                            alt=""
                            fill
                            className="object-cover"
                            sizes="32px"
                            unoptimized
                          />
                        </div>
                        <div className="min-w-0">
                          <span className="line-clamp-2 font-medium text-zinc-100">
                            {book.title}
                          </span>
                          {book.genres.length > 0 && (
                            <p className="line-clamp-1 text-xs text-zinc-500">
                              {book.genres.slice(0, 3).join(", ")}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-zinc-400 md:table-cell">
                      {book.artist ?? book.author ?? "—"}
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <Badge>{categoryLabel(book.category)}</Badge>
                    </td>
                    <td className="hidden px-4 py-3 text-zinc-300 md:table-cell">
                      {pageCountLabel(book.totalPages, book.publicationStatus)}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <Badge
                        className={
                          book.publicationStatus === "ONGOING"
                            ? "border-sky-900/50 bg-sky-950/50 text-sky-300"
                            : book.publicationStatus === "COMPLETED"
                              ? "border-emerald-900/50 bg-emerald-950/50 text-emerald-300"
                              : undefined
                        }
                      >
                        {PUBLICATION_STATUS_LABELS[book.publicationStatus]}
                      </Badge>
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <AdminCoverCorruptedToggle
                        bookId={book.id}
                        coverCorrupted={book.coverCorrupted}
                        compact
                      />
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <AdminAdultToggle
                        bookId={book.id}
                        isAdult={book.isAdult}
                        compact
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/books/${book.id}/edit`}
                        className="text-violet-400 hover:text-violet-300"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AdminPagination
            total={total}
            page={page}
            q={query || undefined}
            hideAdult={hideAdult || undefined}
            genre={genre}
            sort={sort}
            corruptedCovers={showCorrupted || undefined}
            publication={publicationParam}
          />
        </>
      )}
    </div>
  );
}
