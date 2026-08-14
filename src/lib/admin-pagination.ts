export const ADMIN_PAGE_SIZE = 30;

export function parseAdminPage(value: string | undefined): number {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function adminPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
}

export function adminBooksHref(params: {
  page?: number;
  q?: string;
  hideAdult?: boolean;
  genre?: string;
  sort?: string;
  corruptedCovers?: boolean;
  publication?: string;
}): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.hideAdult) search.set("hideAdult", "1");
  if (params.genre) search.set("genre", params.genre);
  if (params.corruptedCovers) search.set("corruptedCovers", "1");
  if (params.publication) search.set("publication", params.publication);
  if (params.sort && params.sort !== "title-asc") search.set("sort", params.sort);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return query ? `/admin/books?${query}` : "/admin/books";
}
