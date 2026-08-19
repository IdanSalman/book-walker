import { cache } from "react";
import { unstable_cache } from "next/cache";

import { hideAdultUserBookFilter } from "@/lib/adult-content";
import {
  getCaughtUpBookIds,
  hideReadUserBookFilter,
} from "@/lib/hide-read-titles";
import { libraryNavTag } from "@/lib/cache-tags";
import { prisma } from "@/lib/prisma";

export type LibraryNavCategory = {
  id: string;
  name: string;
  slug: string;
  count: number;
};

export type LibraryNavData = {
  categories: LibraryNavCategory[];
  uncategorizedCount: number;
  totalCount: number;
  librarySize: number;
};

async function loadLibraryNav(
  userId: string,
  hideAdult: boolean,
  hideRead: boolean,
): Promise<LibraryNavData> {
  const caughtUpBookIds = hideRead ? await getCaughtUpBookIds(userId) : [];
  const userBookFilter = {
    ...hideAdultUserBookFilter(hideAdult),
    ...hideReadUserBookFilter(hideRead, caughtUpBookIds),
  };
  const joinFilter = {
    userBook: {
      ...(hideAdult ? { book: { isAdult: false } } : {}),
      ...hideReadUserBookFilter(hideRead, caughtUpBookIds),
    },
  };

  const [libraryCategories, uncategorizedCount, totalCount, librarySize] =
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
    ]);

  return {
    categories: libraryCategories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      count: cat._count.userBooks,
    })),
    uncategorizedCount,
    totalCount,
    librarySize,
  };
}

export const getLibraryNav = cache(
  (
    userId: string,
    hideAdult: boolean,
    hideRead: boolean,
  ): Promise<LibraryNavData> =>
    unstable_cache(
      () => loadLibraryNav(userId, hideAdult, hideRead),
      ["library-nav", userId, hideAdult ? "1" : "0", hideRead ? "1" : "0"],
      { tags: [libraryNavTag(userId)], revalidate: 60 },
    )(),
);
