export function libraryNavTag(userId: string): string {
  return `library-nav-${userId}`;
}

/** Shared tag so a chapter-count change refreshes every library, not one user. */
export const LIBRARY_NAV_GLOBAL_TAG = "library-nav";
