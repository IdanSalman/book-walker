import Link from "next/link";
import { redirect } from "next/navigation";

import { shouldHideAdultBook } from "@/lib/adult-content";
import { prisma } from "@/lib/prisma";
import { continueChapterIndex } from "@/lib/reader/types";
import { canReadBook } from "@/lib/reader/access";
import { getMangaWithChapters } from "@/lib/reader/mangadex-source";
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
  try {
    const { chapters } = await getMangaWithChapters(book);
    const index = continueChapterIndex(userBook.currentPage, chapters.length);
    chapterId = chapters[index]?.id ?? null;
  } catch {
    chapterId = null;
  }

  if (chapterId) {
    redirect(`/read/${bookId}/${chapterId}`);
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-zinc-950 px-4 text-center">
      <p className="text-zinc-300">
        No readable chapters were found for this title on MangaDex.
      </p>
      <Link href={`/books/${bookId}`} className="text-sm text-violet-400">
        Back to title
      </Link>
    </div>
  );
}
