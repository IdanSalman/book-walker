import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/** Titles the user has caught up on: progress is at or past the latest chapter. */
export async function getCaughtUpBookIds(userId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ bookId: string }[]>`
    SELECT ub."bookId" AS "bookId"
    FROM "UserBook" ub
    INNER JOIN "Book" b ON b.id = ub."bookId"
    WHERE ub."userId" = ${userId}
      AND b."totalPages" > 0
      AND ub."currentPage" >= b."totalPages"
  `;
  return rows.map((row) => row.bookId);
}

/**
 * Manga in any library where at least one reader has finished every listed
 * chapter. Those titles stay hidden for users with hide-read-titles on until
 * the catalog chapter count increases.
 */
export async function getFullyReadLibraryMangaIds(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ bookId: string }[]>`
    SELECT DISTINCT ub."bookId" AS "bookId"
    FROM "UserBook" ub
    INNER JOIN "Book" b ON b.id = ub."bookId"
    WHERE b.category = 'MANGA'
      AND b."totalPages" > 0
      AND ub."currentPage" >= b."totalPages"
  `;
  return rows.map((row) => row.bookId);
}

/**
 * Library shelf. `onlyCaughtUp` lists titles with no chapters left.
 * Otherwise the shelf lists titles that still have chapters, and a Completed
 * status filter keeps those finished titles visible.
 */
export function libraryCaughtUpBookFilter(
  onlyCaughtUp: boolean,
  caughtUpBookIds: string[],
  statusFilter?: string,
): Prisma.UserBookWhereInput {
  if (onlyCaughtUp) {
    return {
      bookId: { in: caughtUpBookIds.length > 0 ? caughtUpBookIds : ["__none__"] },
    };
  }
  if (caughtUpBookIds.length === 0 || statusFilter === "COMPLETED") {
    return {};
  }
  return { bookId: { notIn: caughtUpBookIds } };
}

export function hideReadStoreBookFilter(
  hideRead: boolean,
  caughtUpBookIds: string[],
): Prisma.BookWhereInput {
  if (!hideRead || caughtUpBookIds.length === 0) return {};
  return { id: { notIn: caughtUpBookIds } };
}
