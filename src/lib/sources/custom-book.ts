import { prisma } from "@/lib/prisma";
import { findGoogleBooksCover } from "@/lib/sources/google-books-cover";
import { repairBookCover } from "@/lib/sources/repair-cover";

export const PLACEHOLDER_SUMMARY = "Custom book added to the store.";

export async function enrichCustomBook(bookId: string): Promise<{
  coverFound: boolean;
  sourceName?: string;
}> {
  const book = await prisma.book.findUnique({
    where: { id: bookId },
    select: {
      id: true,
      title: true,
      category: true,
      coverUrl: true,
      coverCorrupted: true,
      sourceName: true,
      sourceUrl: true,
      author: true,
      summary: true,
    },
  });
  if (!book) return { coverFound: false };

  const outcome = await repairBookCover(book);

  const after = await prisma.book.findUnique({
    where: { id: bookId },
    select: { coverUrl: true, author: true, summary: true, category: true },
  });
  if (!after) return { coverFound: false };

  if (
    after.category === "BOOK" &&
    (!after.author?.trim() || after.summary === PLACEHOLDER_SUMMARY)
  ) {
    const google = await findGoogleBooksCover(book.title, after.author);
    const extra: { author?: string; summary?: string } = {};
    if (!after.author?.trim() && google?.author) extra.author = google.author;
    if (after.summary === PLACEHOLDER_SUMMARY && google?.summary) {
      extra.summary = google.summary;
    }
    if (Object.keys(extra).length > 0) {
      await prisma.book.update({ where: { id: bookId }, data: extra });
    }
  }

  return {
    coverFound: Boolean(after.coverUrl.trim()),
    sourceName: outcome.sourceName,
  };
}
