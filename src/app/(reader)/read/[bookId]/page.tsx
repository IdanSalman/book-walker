import { redirect } from "next/navigation";

import { ReaderUnavailable } from "@/components/reader-unavailable";
import { shouldHideAdultBook } from "@/lib/adult-content";
import { prisma } from "@/lib/prisma";
import { continueChapterIndex } from "@/lib/reader/chapter-progress";
import { canReadBook } from "@/lib/reader/access";
import { getMangaWithChapters } from "@/lib/reader/resolve";
import { readerChapterHref } from "@/lib/reader/source-id";
import { requireUser } from "@/lib/session";

export default async function ReadIndexPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  const session = await requireUser();
  const hideAdult = session.user.hideAdultContent ?? true;

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

  if (!book || shouldHideAdultBook(hideAdult, book.isAdult) || !userBook || !canReadBook(book, true)) {
    redirect(`/books/${bookId}`);
  }

  let chapterId: string | null = null;
  let errorMessage: string | null = null;
  try {
    const { chapters } = await getMangaWithChapters(book);
    const index = continueChapterIndex(userBook.currentPage, chapters);
    chapterId = chapters[index]?.id ?? null;
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "No readable chapters were found for this title on the enabled sources.";
  }

  if (chapterId) {
    redirect(readerChapterHref(bookId, chapterId));
  }

  return (
    <ReaderUnavailable
      bookId={bookId}
      message={
        errorMessage ??
        "No readable chapters were found for this title on the enabled sources."
      }
    />
  );
}
