import type { CatalogCandidate } from "@/lib/reader/types";

export const SOURCE_BROWSE_SORTS = ["popular", "latest", "updated"] as const;
export type SourceBrowseSort = (typeof SOURCE_BROWSE_SORTS)[number];

export const SOURCE_BROWSE_PAGE_SIZE = 24;

export const SOURCE_BROWSE_SORT_OPTIONS: {
  value: SourceBrowseSort;
  label: string;
}[] = [
  { value: "popular", label: "Popular" },
  { value: "latest", label: "Latest additions" },
  { value: "updated", label: "Updated recently" },
];

export type SourceBrowseQuery = {
  sort: SourceBrowseSort;
  query?: string;
  categoryId?: string;
  page: number;
  limit: number;
  hideAdult: boolean;
};

export type SourceCategory = {
  id: string;
  name: string;
};

export type SourceBrowsePage = {
  items: CatalogCandidate[];
  page: number;
  hasMore: boolean;
  total?: number;
};

export type SourceBrowseItem = CatalogCandidate & {
  inCatalog: boolean;
  bookId: string | null;
  inLibrary: boolean;
  existingTitle?: {
    id: string;
    title: string;
    sourceName: string | null;
  } | null;
};

export function parseSourceBrowseSort(
  value: string | undefined,
): SourceBrowseSort {
  return SOURCE_BROWSE_SORTS.includes(value as SourceBrowseSort)
    ? (value as SourceBrowseSort)
    : "popular";
}

export function sourceBrowseHref(
  key: string,
  page: number,
  params: {
    view?: string;
    q?: string;
    category?: string;
  },
): string {
  const search = new URLSearchParams();
  if (params.view && params.view !== "popular") search.set("view", params.view);
  if (params.q) search.set("q", params.q);
  if (params.category) search.set("category", params.category);
  if (page > 1) search.set("page", String(page));
  const query = search.toString();
  return query
    ? `/library/add/source/${key}?${query}`
    : `/library/add/source/${key}`;
}
