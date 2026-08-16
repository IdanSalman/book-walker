import { prisma } from "@/lib/prisma";
import { isOngoingPublication } from "@/lib/publication";
import { canReadBook } from "@/lib/reader/access";
import { revalidateUserLibrary } from "@/lib/revalidate-library";

export type SaveReaderProgressInput = {
  bookId: string;
  chapterIndex: number;
  chapterCount: number;
  completedChapter: boolean;
  progressPage: number;
};

export async function saveReaderProgress(
  userId: string,
  input: SaveReaderProgressInput,
): Promise<{ error?: string }> {
  const { bookId, chapterIndex, chapterCount, completedChapter, progressPage } =
    input;

  if (
    !Number.isInteger(chapterIndex) ||
    chapterIndex < 1 ||
    !Number.isInteger(chapterCount) ||
    chapterCount < 1 ||
    !Number.isInteger(progressPage) ||
    progressPage < 1
  ) {
    return { error: "Invalid progress" };
  }

  const [book, userBook] = await Promise.all([
    prisma.book.findUnique({ where: { id: bookId } }),
    prisma.userBook.findUnique({
      where: {
        userId_bookId: {
          userId,
          bookId,
        },
      },
    }),
  ]);

  if (!book || !userBook || !canReadBook(book, true)) {
    return { error: "This title is not in your library" };
  }

  const currentPage = completedChapter
    ? Math.max(userBook.currentPage, progressPage)
    : userBook.currentPage;
  let status = userBook.status;

  if ((completedChapter || currentPage > 0) && status === "PLAN_TO_READ") {
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
  } else if (
    (completedChapter || currentPage > 0) &&
    status !== "COMPLETED"
  ) {
    status = "READING";
  }

  if (currentPage === userBook.currentPage && status === userBook.status) {
    return {};
  }

  await prisma.userBook.update({
    where: {
      userId_bookId: {
        userId,
        bookId,
      },
    },
    data: { currentPage, status },
  });

  revalidateUserLibrary(userId, bookId);
  return {};
}
