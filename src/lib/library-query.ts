import type { BookCategory, Prisma, ReadingStatus } from "@prisma/client";

import { categoryFromSlug } from "@/lib/categories";
import {
  UNCATEGORIZED_SLUG,
} from "@/lib/library-categories";
import { hideAdultBookFilter } from "@/lib/adult-content";
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
    hideAdult?: boolean;
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
  };

  return {
    userId,
    ...collectionFilter,
    ...(status ? { status } : {}),
    ...(Object.keys(bookFilter).length ? { book: bookFilter } : {}),
  };
}

export function libraryOrderBy(
  sort: LibrarySort,
): Prisma.UserBookOrderByWithRelationInput | Prisma.UserBookOrderByWithRelationInput[] {
  switch (sort) {
    case "title-asc":
      return { book: { title: "asc" } };
    case "title-desc":
      return { book: { title: "desc" } };
    case "rating-desc":
      return [{ rating: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }];
    case "progress-desc":
      return { currentPage: "desc" };
    case "added-desc":
      return [{ addedAt: "desc" }, { book: { title: "asc" } }];
    case "added-asc":
      return [{ addedAt: "asc" }, { book: { title: "asc" } }];
    default:
      return { updatedAt: "desc" };
  }
}

export type LibraryHrefParams = {
  collection?: string;
  category?: string;
  status?: string;
  publication?: string;
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

export function libraryPageHref(params: LibraryHrefParams): string {
  const search = new URLSearchParams();
  if (params.collection) search.set("collection", params.collection);
  if (params.category) search.set("category", params.category);
  if (params.status) search.set("status", params.status);
  if (params.publication) search.set("publication", params.publication);
  if (params.sort && params.sort !== "updated-desc") search.set("sort", params.sort);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return query ? `/library?${query}` : "/library";
}
