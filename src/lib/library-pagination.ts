export const LIBRARY_PAGE_SIZE = 24;

export function parseLibraryPage(value: string | undefined): number {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function libraryPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / LIBRARY_PAGE_SIZE));
}
