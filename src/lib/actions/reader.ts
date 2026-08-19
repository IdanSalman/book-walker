"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { canReadBook } from "@/lib/reader/access";
import { latestChapterNumber } from "@/lib/reader/chapter-progress";
import { withFreshReaderFetch } from "@/lib/reader/fetch-mode";
import { getMangaWithChapters } from "@/lib/reader/resolve";
import { saveReaderProgress } from "@/lib/reader/save-progress";
import { revalidateUserLibrary } from "@/lib/revalidate-library";
import { applyResolvedListing } from "@/lib/sources/repair-cover";
import { requireUser } from "@/lib/session";

export async function updateReaderProgress(input: {
  bookId: string;
  chapterIndex: number;
  chapterCount: number;
  completedChapter: boolean;
  progressPage: number;
  pageBased?: boolean;
}): Promise<{ error?: string }> {
  const session = await requireUser();
  return saveReaderProgress(session.user.id, input);
}

export async function refreshReadablePages(bookId: string): Promise<{
  error?: string;
  message?: string;
}> {
  const session = await requireUser();

  const [book, userBook] = await Promise.all([
    prisma.book.findUnique({ where: { id: bookId } }),
    prisma.userBook.findUnique({
      where: {
        userId_bookId: {
          userId: session.user.id,
          bookId,
        },
      },
    }),
  ]);

  if (!book || !userBook || !canReadBook(book, true)) {
    return { error: "This title is not in your library" };
  }

  try {
    const resolved = await withFreshReaderFetch(() =>
      getMangaWithChapters(book),
    );
    await applyResolvedListing(book, resolved);

    const totalPages =
      book.category === "BOOK"
        ? resolved.chapters[0]?.pageCount ?? 0
        : latestChapterNumber(resolved.chapters);
    if (resolved.chapters.length > 0 && totalPages >= 1) {
      await prisma.book.update({
        where: { id: bookId },
        data: {
          totalPages,
          lastSyncedAt: new Date(),
        },
      });
    }

    revalidateUserLibrary(session.user.id, bookId);
    revalidatePath(`/read/${bookId}`);

    if (book.category === "BOOK") {
      const pages = resolved.chapters[0]?.pageCount ?? 0;
      return {
        message: `Found a public scan with ${pages.toLocaleString()} page${pages === 1 ? "" : "s"}.`,
      };
    }

    return {
      message: `Loaded ${resolved.chapters.length.toLocaleString()} chapter${
        resolved.chapters.length === 1 ? "" : "s"
      }.`,
    };
  } catch (error) {
    revalidatePath(`/books/${bookId}`);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Pages could not be loaded from the current sources.",
    };
  }
}

