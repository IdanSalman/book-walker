export const STORE_PAGE_SIZE = 24;

export function parseStorePage(value: string | undefined): number {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function storePageCount(total: number): number {
  return Math.max(1, Math.ceil(total / STORE_PAGE_SIZE));
}

export { storePageHref } from "@/lib/store-query";
