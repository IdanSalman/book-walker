import type { BookCategory, Prisma } from "@prisma/client";

import {
  parseStoreContentFilter,
  storeContentFilter,
  type StoreContentFilter,
} from "@/lib/adult-content";
import { categoryFromSlug } from "@/lib/categories";
import { parsePublicationFilter } from "@/lib/publication";
import { hideReadStoreBookFilter } from "@/lib/hide-read-titles";
import { prisma } from "@/lib/prisma";
/** Hide books with broken PNG covers from the public store. */
export function hideCorruptedCoverFilter(): Prisma.BookWhereInput {
  return { coverCorrupted: false };
}

export type StoreSort =
  | "title-asc"
  | "title-desc"
  | "newest"
  | "oldest"
  | "pages-asc"
  | "pages-desc"
  | "rating-desc";

export const STORE_SORT_OPTIONS: { value: StoreSort; label: string }[] = [
  { value: "title-asc", label: "Title (A–Z)" },
  { value: "title-desc", label: "Title (Z–A)" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "pages-asc", label: "Pages (fewest)" },
  { value: "pages-desc", label: "Pages (most)" },
  { value: "rating-desc", label: "Highest rated" },
];

export type StoreQueryParams = {
  category?: string;
  genre?: string;
  sort?: string;
  q?: string;
  content?: string;
  publication?: string;
  page?: string;
};

export function parseStoreSort(value: string | undefined): StoreSort {
  const valid = STORE_SORT_OPTIONS.some((o) => o.value === value);
  return valid ? (value as StoreSort) : "title-asc";
}

export function buildStoreWhere(
  params: {
    category?: string;
    genre?: string;
    hideAdult: boolean;
    hideRead?: boolean;
    userId?: string;
    content?: string;
    publication?: string;
    q?: string;
  },
): Prisma.BookWhereInput {
  const selected = params.category
    ? categoryFromSlug(params.category)
    : undefined;
  const categoryFilter: BookCategory | undefined = selected?.value;
  const genre = params.genre?.trim();
  const query = params.q?.trim();
  const contentFilter = parseStoreContentFilter(params.content, params.hideAdult);
  const publicationStatus = parsePublicationFilter(params.publication);

  return {
    ...(categoryFilter ? { category: categoryFilter } : {}),
    ...(genre ? { genres: { has: genre } } : {}),
    ...(publicationStatus ? { publicationStatus } : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { artist: { contains: query, mode: "insensitive" } },
            { author: { contains: query, mode: "insensitive" } },
            { sourceName: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
    ...storeContentFilter(contentFilter),
    ...hideCorruptedCoverFilter(),
    ...(params.userId
      ? hideReadStoreBookFilter(params.userId, Boolean(params.hideRead))
      : {}),
  };
}

export function storePageHref(
  page: number,
  params: {
    category?: string;
    genre?: string;
    sort?: string;
    q?: string;
    content?: string;
    publication?: string;
  },
): string {
  const search = new URLSearchParams();
  if (params.category) search.set("category", params.category);
  if (params.genre) search.set("genre", params.genre);
  if (params.q) search.set("q", params.q);
  if (params.content && params.content !== "all") {
    search.set("content", params.content);
  }
  if (params.publication) search.set("publication", params.publication);
  if (params.sort && params.sort !== "title-asc") search.set("sort", params.sort);
  if (page > 1) search.set("page", String(page));
  const query = search.toString();
  return query ? `/library/add?${query}` : "/library/add";
}

export function genreStoreHref(
  genre: string,
  params?: { category?: string; sort?: string },
): string {
  return storePageHref(1, {
    category: params?.category,
    genre,
    sort: params?.sort,
  });
}

function orderByForSort(sort: StoreSort): Prisma.BookOrderByWithRelationInput {
  switch (sort) {
    case "title-desc":
      return { title: "desc" };
    case "newest":
      return { createdAt: "desc" };
    case "oldest":
      return { createdAt: "asc" };
    case "pages-asc":
      return { totalPages: "asc" };
    case "pages-desc":
      return { totalPages: "desc" };
    default:
      return { title: "asc" };
  }
}

async function fetchStoreBooksByRating(
  where: Prisma.BookWhereInput,
  skip: number,
  take: number,
): Promise<StoreBookCard[]> {
  const matching = await prisma.book.findMany({ where, select: { id: true } });
  if (matching.length === 0) return [];

  const ids = matching.map((b) => b.id);

  return prisma.$queryRaw<StoreBookCard[]>`
    SELECT
      b.id,
      b.title,
      b.summary,
      b."coverUrl",
      b."totalPages",
      b.category,
      b."publicationStatus",
      b."isAdult",
      b."coverCorrupted",
      b.artist,
      b.author,
      b.genres
    FROM "Book" b
    LEFT JOIN (
      SELECT "bookId", AVG(rating)::float AS avg_rating
      FROM "UserBook"
      WHERE rating IS NOT NULL AND "bookId" = ANY(${ids}::text[])
      GROUP BY "bookId"
    ) r ON r."bookId" = b.id
    WHERE b.id = ANY(${ids}::text[])
    ORDER BY r.avg_rating DESC NULLS LAST, b.title ASC
    OFFSET ${skip} LIMIT ${take}
  `;
}

export const STORE_BOOK_CARD_SELECT = {
  id: true,
  title: true,
  summary: true,
  coverUrl: true,
  totalPages: true,
  category: true,
  publicationStatus: true,
  isAdult: true,
  coverCorrupted: true,
  artist: true,
  author: true,
  genres: true,
} satisfies Prisma.BookSelect;

export type StoreBookCard = Prisma.BookGetPayload<{
  select: typeof STORE_BOOK_CARD_SELECT;
}>;

export async function fetchStoreBooks(
  where: Prisma.BookWhereInput,
  sort: StoreSort,
  skip: number,
  take: number,
): Promise<StoreBookCard[]> {
  if (sort === "rating-desc") {
    return fetchStoreBooksByRating(where, skip, take);
  }

  return prisma.book.findMany({
    where,
    orderBy: orderByForSort(sort),
    skip,
    take,
    select: STORE_BOOK_CARD_SELECT,
  });
}

export async function getStoreGenres(
  contentFilter: StoreContentFilter = "all",
  options: {
    category?: BookCategory;
    limit?: number;
    userId?: string;
    hideRead?: boolean;
  } = {},
) {
  const { category, limit = 80, userId, hideRead } = options;

  const conditions = [
    `array_length(genres, 1) > 0`,
    `"coverCorrupted" = false`,
  ];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (contentFilter === "adult") {
    conditions.push(`"isAdult" = true`);
  } else if (contentFilter === "safe") {
    conditions.push(`"isAdult" = false`);
  }

  if (category) {
    conditions.push(`category = $${paramIndex}::"BookCategory"`);
    params.push(category);
    paramIndex++;
  }

  if (hideRead && userId) {
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM "UserBook" ub
      WHERE ub."bookId" = "Book".id
        AND ub."userId" = $${paramIndex}
        AND ub.status = 'COMPLETED'
    )`);
    params.push(userId);
    paramIndex++;
  }

  params.push(limit);

  const rows = await prisma.$queryRawUnsafe<{ genre: string; count: number }[]>(
    `
    SELECT g AS genre, COUNT(*)::int AS count
    FROM "Book", unnest(genres) AS g
    WHERE ${conditions.join("\n      AND ")}
    GROUP BY g
    ORDER BY count DESC, g ASC
    LIMIT $${paramIndex}
  `,
    ...params,
  );
  return rows;
}
