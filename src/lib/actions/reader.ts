"use server";

import { prisma } from "@/lib/prisma";
import { isOngoingPublication } from "@/lib/publication";
import { canReadBook } from "@/lib/reader/access";
import { revalidateUserLibrary } from "@/lib/revalidate-library";
import { requireUser } from "@/lib/session";

export async function updateReaderProgress(input: {
  bookId: string;
  chapterIndex: number;
  chapterCount: number;
  completedChapter: boolean;
}): Promise<{ error?: string }> {
  const session = await requireUser();
  const { bookId, chapterIndex, chapterCount, completedChapter } = input;

  if (
    !Number.isInteger(chapterIndex) ||
    chapterIndex < 1 ||
    !Number.isInteger(chapterCount) ||
    chapterCount < 1
  ) {
    return { error: "Invalid progress" };
  }

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

  const currentPage = Math.max(userBook.currentPage, chapterIndex);
  let status = userBook.status;

  if (currentPage > 0 && status === "PLAN_TO_READ") {
    status = "READING";
  }

  if (
    completedChapter &&
    chapterIndex >= chapterCount &&
    !isOngoingPublication(book.publicationStatus)
  ) {
    status = "COMPLETED";
  } else if (status === "COMPLETED" && chapterIndex < chapterCount) {
    status = "READING";
  } else if (currentPage > 0 && status !== "COMPLETED") {
    status = "READING";
  }

  await prisma.userBook.update({
    where: {
      userId_bookId: {
        userId: session.user.id,
        bookId,
      },
    },
    data: { currentPage, status },
  });

  revalidateUserLibrary(session.user.id, bookId);
  return {};
}
