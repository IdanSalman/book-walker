import type { BookCategory } from "@prisma/client";

import { hideAdultUserBookFilter } from "@/lib/adult-content";
import {
  UNCATEGORIZED_NAME,
  UNCATEGORIZED_SLUG,
} from "@/lib/library-categories";
import { prisma } from "@/lib/prisma";

export type LibraryCollectionStat = {
  slug: string;
  name: string;
  count: number;
  reading: number;
  completed: number;
  progress: number;
};

type StatRow = {
  slug: string;
  name: string;
  count: number;
  reading: number;
  completed: number;
  readPages: number;
  totalPages: number;
};

type TypeStatRow = {
  category: BookCategory;
  count: number;
  reading: number;
  completed: number;
  readPages: number;
  totalPages: number;
};

function toStat(row: {
  slug: string;
  name: string;
  count: number;
  reading: number;
  completed: number;
  readPages: number;
  totalPages: number;
}): LibraryCollectionStat {
  return {
    slug: row.slug,
    name: row.name,
    count: row.count,
    reading: row.reading,
    completed: row.completed,
    progress: row.totalPages > 0 ? (row.readPages / row.totalPages) * 100 : 0,
  };
}

export async function getDashboardLibraryStats(
  userId: string,
  hideAdult: boolean,
): Promise<{
  collections: LibraryCollectionStat[];
  uncategorized: LibraryCollectionStat | null;
  byType: TypeStatRow[];
  totalCount: number;
}> {
  const [collectionRows, uncategorizedRows, byType, totalCount] =
    await Promise.all([
      prisma.$queryRaw<StatRow[]>`
        SELECT
          lc.slug,
          lc.name,
          COUNT(b.id)::int AS count,
          COUNT(*) FILTER (WHERE b.id IS NOT NULL AND ub.status = 'READING')::int AS reading,
          COUNT(*) FILTER (WHERE b.id IS NOT NULL AND ub.status = 'COMPLETED')::int AS completed,
          COALESCE(SUM(CASE WHEN b.id IS NOT NULL THEN ub."currentPage" ELSE 0 END), 0)::int AS "readPages",
          COALESCE(SUM(b."totalPages"), 0)::int AS "totalPages"
        FROM "LibraryCategory" lc
        LEFT JOIN "UserBookCategory" ubc ON ubc."categoryId" = lc.id
        LEFT JOIN "UserBook" ub
          ON ub.id = ubc."userBookId" AND ub."userId" = lc."userId"
        LEFT JOIN "Book" b
          ON b.id = ub."bookId"
          AND (${hideAdult} = false OR b."isAdult" = false)
        WHERE lc."userId" = ${userId}
        GROUP BY lc.id
        ORDER BY lc."sortOrder" ASC
      `,
      prisma.$queryRaw<Omit<StatRow, "slug" | "name">[]>`
        SELECT
          COUNT(*)::int AS count,
          COUNT(*) FILTER (WHERE ub.status = 'READING')::int AS reading,
          COUNT(*) FILTER (WHERE ub.status = 'COMPLETED')::int AS completed,
          COALESCE(SUM(ub."currentPage"), 0)::int AS "readPages",
          COALESCE(SUM(b."totalPages"), 0)::int AS "totalPages"
        FROM "UserBook" ub
        INNER JOIN "Book" b ON b.id = ub."bookId"
        WHERE ub."userId" = ${userId}
          AND NOT EXISTS (
            SELECT 1 FROM "UserBookCategory" ubc
            WHERE ubc."userBookId" = ub.id
          )
          AND (${hideAdult} = false OR b."isAdult" = false)
      `,
      prisma.$queryRaw<TypeStatRow[]>`
        SELECT
          b.category,
          COUNT(*)::int AS count,
          COUNT(*) FILTER (WHERE ub.status = 'READING')::int AS reading,
          COUNT(*) FILTER (WHERE ub.status = 'COMPLETED')::int AS completed,
          COALESCE(SUM(ub."currentPage"), 0)::int AS "readPages",
          COALESCE(SUM(b."totalPages"), 0)::int AS "totalPages"
        FROM "UserBook" ub
        INNER JOIN "Book" b ON b.id = ub."bookId"
        WHERE ub."userId" = ${userId}
          AND (${hideAdult} = false OR b."isAdult" = false)
        GROUP BY b.category
      `,
      prisma.userBook.count({
        where: {
          userId,
          ...hideAdultUserBookFilter(hideAdult),
        },
      }),
    ]);

  const uncategorizedRow = uncategorizedRows[0];
  const uncategorized =
    uncategorizedRow && uncategorizedRow.count > 0
      ? toStat({
          slug: UNCATEGORIZED_SLUG,
          name: UNCATEGORIZED_NAME,
          ...uncategorizedRow,
        })
      : null;

  return {
    collections: collectionRows
      .filter((row) => row.count > 0)
      .map(toStat),
    uncategorized,
    byType,
    totalCount,
  };
}

export const DASHBOARD_RECENT_SELECT = {
  id: true,
  bookId: true,
  currentPage: true,
  rating: true,
  status: true,
  book: {
    select: {
      id: true,
      title: true,
      coverUrl: true,
      totalPages: true,
      category: true,
      publicationStatus: true,
    },
  },
} as const;
