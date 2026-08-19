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

export function hideReadUserBookFilter(
  hideRead: boolean,
  caughtUpBookIds: string[],
  statusFilter?: string,
): Prisma.UserBookWhereInput {
  if (
    !hideRead ||
    caughtUpBookIds.length === 0 ||
    statusFilter === "COMPLETED"
  ) {
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
