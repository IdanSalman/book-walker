export const LIBRARY_CAUGHT_UP_VIEW_COOKIE = "bw-library-hide-caught-up";

export type LibraryCaughtUpMode = "reading" | "only";

/**
 * `only` is the shelf of titles with no chapters left.
 * Older cookies: "0" was that shelf mixed into the library, "1" was the reading list.
 */
export function readLibraryCaughtUpMode(
  value: string | undefined | null,
): LibraryCaughtUpMode {
  if (value === "only" || value === "0") return "only";
  return "reading";
}

export function libraryCaughtUpCookieHeader(mode: LibraryCaughtUpMode): string {
  const maxAge = 60 * 60 * 24 * 365;
  return `${LIBRARY_CAUGHT_UP_VIEW_COOKIE}=${mode}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

/** Progress is at or past the latest listed chapter. */
export function isCaughtUpTitle(currentPage: number, totalPages: number): boolean {
  return totalPages > 0 && currentPage >= totalPages;
}

export function visibleLibraryCount(
  total: number,
  caughtUp: number,
  onlyCaughtUp: boolean,
): number {
  if (onlyCaughtUp) return caughtUp;
  return Math.max(0, total - caughtUp);
}
