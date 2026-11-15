import { after } from "next/server";

import { ChapterList } from "@/components/chapter-list";
import { PublishChapterTotal } from "@/components/chapter-total";
import { RefreshReadableButton } from "@/components/refresh-readable-button";
import { latestChapterNumber } from "@/lib/reader/chapter-progress";
import { getMangaWithChapters } from "@/lib/reader/resolve";
import { persistChapterCountIncrease } from "@/lib/reader/sync-chapter-count";
import type { ReaderChapter } from "@/lib/reader/types";
import { applyResolvedListing } from "@/lib/sources/repair-cover";
import type { BookCategory } from "@prisma/client";

export async function ReadableChapterSection({
  book,
  currentPage,
}: {
  book: {
    id: string;
    title: string;
    coverUrl: string;
    coverCorrupted: boolean;
    sourceUrl: string | null;
    sourceName: string | null;
    externalId: string | null;
    author: string | null;
    category: BookCategory;
    totalPages: number;
  };
  currentPage: number;
}) {
  let chapters: ReaderChapter[] | null = null;
  let sourceName: string | null = null;
  let sourceUrl: string | null = null;
  let errorMessage: string | null = null;

  try {
    const resolved = await getMangaWithChapters(book);
    chapters = resolved.chapters;
    sourceName = resolved.sourceName;
    sourceUrl = resolved.sourceUrl;
    after(() => {
      void applyResolvedListing(book, resolved).catch(() => {
        /* next visit can repair the cover */
      });
    });
    if (book.category === "MANGA" || book.category === "LIGHT_NOVEL") {
      await persistChapterCountIncrease(
        book.id,
        book.totalPages,
        resolved.chapters,
      ).catch(() => {
        /* the list still renders; the next visit can save the count */
      });
    }
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Chapters could not be loaded.";
  }

  if (errorMessage || !chapters) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Read
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          {errorMessage ??
            (book.category === "BOOK"
              ? "A public page scan could not be loaded."
              : "Chapters could not be loaded.")}
        </p>
        <div className="mt-4">
          <RefreshReadableButton
            bookId={book.id}
            label={
              book.category === "BOOK"
                ? "Look up a public scan"
                : "Reload chapters"
            }
            retryLabel="Try again"
          />
        </div>
      </div>
    );
  }

  const chapterTotal =
    book.category === "MANGA" || book.category === "LIGHT_NOVEL"
      ? latestChapterNumber(chapters)
      : null;

  return (
    <>
      {chapterTotal != null && <PublishChapterTotal totalPages={chapterTotal} />}
      <ChapterList
        bookId={book.id}
        chapters={chapters}
        currentPage={currentPage}
        sourceName={sourceName}
        sourceUrl={sourceUrl}
        variant={book.category === "BOOK" ? "pages" : "chapters"}
      />
    </>
  );
}
