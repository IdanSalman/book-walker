import { redirect } from "next/navigation";

import { MangaReader } from "@/components/manga-reader";
import { ReaderUnavailable } from "@/components/reader-unavailable";
import { shouldHideAdultBook } from "@/lib/adult-content";
import { prisma } from "@/lib/prisma";
import { canReadBook } from "@/lib/reader/access";
import { getMangaWithChapters } from "@/lib/reader/resolve";
import { decodeChapterIdParam, isChapterId } from "@/lib/reader/source-id";
import { defaultReadingMode } from "@/lib/reader/types";
import { requireUser } from "@/lib/session";

export default async function ReadChapterPage({
  params,
}: {
  params: Promise<{ bookId: string; chapterId: string }>;
}) {
  const { bookId, chapterId: rawChapterId } = await params;
  const chapterId = decodeChapterIdParam(
    Array.isArray(rawChapterId) ? rawChapterId.join("/") : rawChapterId,
  );
  if (!isChapterId(chapterId)) {
    redirect(`/read/${bookId}`);
  }
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

  if (
    !book ||
    shouldHideAdultBook(hideAdult, book.isAdult) ||
    !userBook ||
    !canReadBook(book, true)
  ) {
    redirect(`/books/${bookId}`);
  }

  let resolved;
  try {
    resolved = await getMangaWithChapters(book);
  } catch (error) {
    return (
      <ReaderUnavailable
        bookId={book.id}
        message={
          error instanceof Error
            ? error.message
            : "This chapter could not be loaded from the source."
        }
      />
    );
  }

  return (
    <MangaReader
      bookId={book.id}
      bookTitle={book.title}
      chapters={resolved.chapters}
      chapterId={chapterId}
      currentPage={userBook.currentPage}
      suggestedMode={
        book.category === "MANGA"
          ? defaultReadingMode(
              resolved.manga.originalLanguage,
              session.user.defaultReadingMode,
            )
          : "ltr"
      }
      progressMode={book.category === "MANGA" ? "chapter" : "page"}
    />
  );
}
