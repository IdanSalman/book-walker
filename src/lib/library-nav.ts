import { cache } from "react";
import { unstable_cache } from "next/cache";

import { hideAdultUserBookFilter } from "@/lib/adult-content";
import { libraryNavTag } from "@/lib/cache-tags";
import { prisma } from "@/lib/prisma";

export type LibraryNavCategory = {
  id: string;
  name: string;
  slug: string;
  count: number;
  caughtUpCount: number;
};

export type LibraryNavData = {
  categories: LibraryNavCategory[];
  uncategorizedCount: number;
  uncategorizedCaughtUpCount: number;
  totalCount: number;
  totalCaughtUpCount: number;
  librarySize: number;
};

/**
 * Counts of titles the user has read through the latest chapter.
 * One batch, so the library toggle can adjust chips without another request.
 */
async function loadCaughtUpCounts(userId: string, hideAdult: boolean) {
  const [totalRows, uncategorizedRows, categoryRows] = await Promise.all([
    prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM "UserBook" ub
      INNER JOIN "Book" b ON b.id = ub."bookId"
      WHERE ub."userId" = ${userId}
        AND b."totalPages" > 0
        AND ub."currentPage" >= b."totalPages"
        AND (${hideAdult} = false OR b."isAdult" = false)
    `,
    prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM "UserBook" ub
      INNER JOIN "Book" b ON b.id = ub."bookId"
      WHERE ub."userId" = ${userId}
        AND b."totalPages" > 0
        AND ub."currentPage" >= b."totalPages"
        AND (${hideAdult} = false OR b."isAdult" = false)
        AND NOT EXISTS (
          SELECT 1 FROM "UserBookCategory" ubc
          WHERE ubc."userBookId" = ub.id
        )
    `,
    prisma.$queryRaw<{ slug: string; count: number }[]>`
      SELECT lc.slug AS slug, COUNT(*)::int AS count
      FROM "UserBookCategory" ubc
      INNER JOIN "LibraryCategory" lc ON lc.id = ubc."categoryId"
      INNER JOIN "UserBook" ub ON ub.id = ubc."userBookId"
      INNER JOIN "Book" b ON b.id = ub."bookId"
      WHERE lc."userId" = ${userId}
        AND b."totalPages" > 0
        AND ub."currentPage" >= b."totalPages"
        AND (${hideAdult} = false OR b."isAdult" = false)
      GROUP BY lc.slug
    `,
  ]);

  return {
    total: Number(totalRows[0]?.count ?? 0),
    uncategorized: Number(uncategorizedRows[0]?.count ?? 0),
    bySlug: new Map(
      categoryRows.map((row) => [row.slug, Number(row.count)]),
    ),
  };
}

async function loadLibraryNav(
  userId: string,
  hideAdult: boolean,
): Promise<LibraryNavData> {
  const userBookFilter = hideAdultUserBookFilter(hideAdult);
  const joinFilter = {
    userBook: hideAdult ? { book: { isAdult: false } } : {},
  };

  const [libraryCategories, uncategorizedCount, totalCount, librarySize, caughtUp] =
    await Promise.all([
      prisma.libraryCategory.findMany({
        where: { userId },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
          _count: {
            select: {
              userBooks: { where: joinFilter },
            },
          },
        },
      }),
      prisma.userBook.count({
        where: {
          userId,
          categories: { none: {} },
          ...userBookFilter,
        },
      }),
      prisma.userBook.count({
        where: {
          userId,
          ...userBookFilter,
        },
      }),
      prisma.userBook.count({ where: { userId } }),
      loadCaughtUpCounts(userId, hideAdult),
    ]);

  return {
    categories: libraryCategories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      count: cat._count.userBooks,
      caughtUpCount: caughtUp.bySlug.get(cat.slug) ?? 0,
    })),
    uncategorizedCount,
    uncategorizedCaughtUpCount: caughtUp.uncategorized,
    totalCount,
    totalCaughtUpCount: caughtUp.total,
    librarySize,
  };
}

export const getLibraryNav = cache(
  (userId: string, hideAdult: boolean): Promise<LibraryNavData> =>
    unstable_cache(
      () => loadLibraryNav(userId, hideAdult),
      ["library-nav-v2", userId, hideAdult ? "1" : "0"],
      { tags: [libraryNavTag(userId)], revalidate: 60 },
    )(),
);
