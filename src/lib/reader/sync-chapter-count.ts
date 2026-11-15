import { after } from "next/server";

import { prisma } from "@/lib/prisma";
import { latestChapterNumber } from "@/lib/reader/chapter-progress";
import type { ReaderChapter } from "@/lib/reader/types";
import { revalidateCatalogChapterCount } from "@/lib/revalidate-library";

/** Latest listed chapter when it is past the stored total. */
export function increasedChapterTotal(
  storedTotal: number,
  chapters: ReaderChapter[],
): number | null {
  if (chapters.length === 0) return null;
  const latest = latestChapterNumber(chapters);
  if (!Number.isFinite(latest) || latest <= storedTotal) return null;
  return latest;
}

/**
 * Save a higher chapter total on the catalog title. Progress is
 * current chapter over this total, so the new number applies everywhere.
 */
export async function persistChapterCountIncrease(
  bookId: string,
  storedTotal: number,
  chapters: ReaderChapter[],
): Promise<number | null> {
  const next = increasedChapterTotal(storedTotal, chapters);
  if (next == null) return null;

  await prisma.book.update({
    where: { id: bookId },
    data: { totalPages: next, lastSyncedAt: new Date() },
  });
  after(() => {
    revalidateCatalogChapterCount(bookId);
  });
  return next;
}
