export const LIBRARY_HIDE_CAUGHT_UP_COOKIE = "bw-library-hide-caught-up";

/** Library view preference. Absent or any other value means caught-up titles stay visible. */
export function readHideCaughtUpCookie(
  value: string | undefined | null,
): boolean {
  return value === "1";
}

export function hideCaughtUpCookieHeader(hide: boolean): string {
  const maxAge = 60 * 60 * 24 * 365;
  return `${LIBRARY_HIDE_CAUGHT_UP_COOKIE}=${hide ? "1" : "0"}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

/** Progress is at or past the latest listed chapter. */
export function isCaughtUpTitle(currentPage: number, totalPages: number): boolean {
  return totalPages > 0 && currentPage >= totalPages;
}

export function visibleLibraryCount(
  total: number,
  caughtUp: number,
  hideCaughtUp: boolean,
): number {
  if (!hideCaughtUp) return total;
  return Math.max(0, total - caughtUp);
}
