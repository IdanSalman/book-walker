import type { BookCategory, Prisma, ReadingStatus } from "@prisma/client";

import { categoryFromSlug } from "@/lib/categories";
import {
  UNCATEGORIZED_SLUG,
} from "@/lib/library-categories";
import { hideAdultBookFilter } from "@/lib/adult-content";
import { containsTextVariants } from "@/lib/contains-text";
import {
  getCaughtUpBookIds,
  hideReadUserBookFilter,
} from "@/lib/hide-read-titles";
import {
  LIBRARY_PAGE_SIZE,
  libraryPageCount,
} from "@/lib/library-pagination";
import { prisma } from "@/lib/prisma";
import { parsePublicationFilter } from "@/lib/publication";

export type LibrarySort =
  | "updated-desc"
  | "added-desc"
  | "added-asc"
  | "title-asc"
  | "title-desc"
  | "rating-desc"
  | "progress-desc";

export const LIBRARY_SORT_OPTIONS: { value: LibrarySort; label: string }[] = [
  { value: "updated-desc", label: "Recently updated" },
  { value: "added-desc", label: "Date added (newest)" },
  { value: "added-asc", label: "Date added (oldest)" },
  { value: "title-asc", label: "Title (A–Z)" },
  { value: "title-desc", label: "Title (Z–A)" },
  { value: "rating-desc", label: "Highest rated" },
  { value: "progress-desc", label: "Most progress" },
];

export const LIBRARY_STATUS_OPTIONS: {
  value: ReadingStatus;
  label: string;
}[] = [
  { value: "READING", label: "Reading" },
  { value: "COMPLETED", label: "Completed" },
  { value: "PLAN_TO_READ", label: "Plan to read" },
];

export function parseLibrarySort(value: string | undefined): LibrarySort {
  const valid = LIBRARY_SORT_OPTIONS.some((o) => o.value === value);
  return valid ? (value as LibrarySort) : "updated-desc";
}

export function buildLibraryWhere(
  userId: string,
  params: {
    collection?: string;
    category?: string;
    status?: string;
    publication?: string;
    q?: string;
    hideAdult?: boolean;
    hideRead?: boolean;
    caughtUpBookIds?: string[];
  },
): Prisma.UserBookWhereInput {
  const selected = params.category
    ? categoryFromSlug(params.category)
    : undefined;
  const categoryFilter: BookCategory | undefined = selected?.value;
  const status = LIBRARY_STATUS_OPTIONS.find((o) => o.value === params.status)
    ?.value;
  const publicationStatus = parsePublicationFilter(params.publication);
  const collection = params.collection?.trim() || undefined;
  const query = params.q?.trim();
  const queryVariants = query ? containsTextVariants(query) : [];

  const collectionFilter: Prisma.UserBookWhereInput =
    collection === UNCATEGORIZED_SLUG
      ? { categories: { none: {} } }
      : collection
        ? {
            categories: {
              some: { category: { userId, slug: collection } },
            },
          }
        : {};

  const bookFilter = {
    ...hideAdultBookFilter(Boolean(params.hideAdult)),
    ...(categoryFilter ? { category: categoryFilter } : {}),
    ...(publicationStatus ? { publicationStatus } : {}),
    ...(queryVariants.length
      ? {
          OR: queryVariants.flatMap((variant) => [
            { title: { contains: variant, mode: "insensitive" as const } },
            { artist: { contains: variant, mode: "insensitive" as const } },
            { author: { contains: variant, mode: "insensitive" as const } },
            { sourceName: { contains: variant, mode: "insensitive" as const } },
          ]),
        }
      : {}),
  };

  return {
    userId,
    ...collectionFilter,
    ...(status ? { status } : {}),
    ...hideReadUserBookFilter(
      Boolean(params.hideRead),
      params.caughtUpBookIds ?? [],
      status,
    ),
    ...(Object.keys(bookFilter).length ? { book: bookFilter } : {}),
  };
}

export function libraryOrderBy(
  sort: LibrarySort,
): Prisma.UserBookOrderByWithRelationInput[] {
  const id: Prisma.UserBookOrderByWithRelationInput = { id: "asc" };
  switch (sort) {
    case "title-asc":
      return [{ book: { title: "asc" } }, id];
    case "title-desc":
      return [{ book: { title: "desc" } }, id];
    case "rating-desc":
      return [
        { rating: { sort: "desc", nulls: "last" } },
        { updatedAt: "desc" },
        id,
      ];
    case "progress-desc":
      return [{ currentPage: "desc" }, id];
    case "added-desc":
      return [{ addedAt: "desc" }, { book: { title: "asc" } }, id];
    case "added-asc":
      return [{ addedAt: "asc" }, { book: { title: "asc" } }, id];
    default:
      return [{ updatedAt: "desc" }, id];
  }
}

export type LibraryHrefParams = {
  collection?: string;
  category?: string;
  status?: string;
  publication?: string;
  q?: string;
  sort?: string;
  page?: number;
};

export const LIBRARY_USER_BOOK_SELECT = {
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
      isAdult: true,
      coverCorrupted: true,
    },
  },
  categories: {
    select: {
      categoryId: true,
      category: { select: { name: true } },
    },
  },
} satisfies Prisma.UserBookSelect;

export type LibraryUserBook = Prisma.UserBookGetPayload<{
  select: typeof LIBRARY_USER_BOOK_SELECT;
}>;

export type LibraryPageResult = {
  items: LibraryUserBook[];
  total: number;
  page: number;
  pageCount: number;
  hasMore: boolean;
};

export async function fetchLibraryPage(options: {
  userId: string;
  hideAdult: boolean;
  hideRead: boolean;
  filterParams: LibraryHrefParams;
  sort: LibrarySort;
  page: number;
}): Promise<LibraryPageResult> {
  const caughtUpBookIds = options.hideRead
    ? await getCaughtUpBookIds(options.userId)
    : [];
  const where = buildLibraryWhere(options.userId, {
    collection: options.filterParams.collection,
    category: options.filterParams.category,
    status: options.filterParams.status,
    publication: options.filterParams.publication,
    q: options.filterParams.q,
    hideAdult: options.hideAdult,
    hideRead: options.hideRead,
    caughtUpBookIds,
  });

  const [total, items] = await Promise.all([
    prisma.userBook.count({ where }),
    prisma.userBook.findMany({
      where,
      select: LIBRARY_USER_BOOK_SELECT,
      orderBy: libraryOrderBy(options.sort),
      skip: (options.page - 1) * LIBRARY_PAGE_SIZE,
      take: LIBRARY_PAGE_SIZE,
    }),
  ]);

  const pageCount = libraryPageCount(total);
  return {
    items,
    total,
    page: Math.min(options.page, pageCount),
    pageCount,
    hasMore: options.page < pageCount,
  };
}

export function libraryPageHref(params: LibraryHrefParams): string {
  const search = new URLSearchParams();
  if (params.collection) search.set("collection", params.collection);
  if (params.category) search.set("category", params.category);
  if (params.status) search.set("status", params.status);
  if (params.publication) search.set("publication", params.publication);
  if (params.q) search.set("q", params.q);
  if (params.sort && params.sort !== "updated-desc") search.set("sort", params.sort);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return query ? `/library?${query}` : "/library";
}
