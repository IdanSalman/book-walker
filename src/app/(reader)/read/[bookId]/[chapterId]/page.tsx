import { notFound } from "next/navigation";

import { MangaReader } from "@/components/manga-reader";
import { shouldHideAdultBook } from "@/lib/adult-content";
import { prisma } from "@/lib/prisma";
import { canReadBook } from "@/lib/reader/access";
import { getMangaWithChapters } from "@/lib/reader/resolve";
import { isChapterId } from "@/lib/reader/source-id";
import { defaultReadingMode } from "@/lib/reader/types";
import { requireUser } from "@/lib/session";

export default async function ReadChapterPage({
  params,
}: {
  params: Promise<{ bookId: string; chapterId: string }>;
}) {
  const { bookId, chapterId: rawChapterId } = await params;
  const chapterId = decodeURIComponent(rawChapterId);
  if (!isChapterId(chapterId)) {
    notFound();
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

  if (!book || shouldHideAdultBook(hideAdult, book.isAdult) || !userBook || !canReadBook(book, true)) {
    notFound();
  }

  let resolved;
  try {
    resolved = await getMangaWithChapters(book);
  } catch {
    notFound();
  }

  if (!resolved.chapters.some((chapter) => chapter.id === chapterId)) {
    notFound();
  }

  return (
    <MangaReader
      bookId={book.id}
      bookTitle={book.title}
      chapters={resolved.chapters}
      chapterId={chapterId}
      currentPage={userBook.currentPage}
      suggestedMode={defaultReadingMode(resolved.manga.originalLanguage)}
    />
  );
}
