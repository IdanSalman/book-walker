/** Chapters already read before a manga or light novel can be suggested. */
export const MIN_CHAPTERS_READ = 3;

/** Pages already read before a book can be suggested. */
export const MIN_BOOK_PAGES_READ = 20;

/** How long the reader must have been closed before a title is stalled. */
export const STALE_AFTER_DAYS = 14;

/** Gap at which the staleness penalty reaches its full size. */
export const ANCIENT_AFTER_DAYS = STALE_AFTER_DAYS + 365 * 2;

/** Points removed from an otherwise equal title left unread for years. */
export const STALENESS_PENALTY = 8;

export const SUGGESTION_BATCH_SIZE = 5;

export const SUGGESTION_POOL_SIZE = 30;

/** Open Library averages below this count are too thin to stand in for taste. */
export const MIN_COMMUNITY_RATING_COUNT = 5;

export const COMMUNITY_LOOKUP_MS = 4000;

/**
 * Personal, community, genre, creator, and investment weights are relative.
 * A missing personal rating drops out, and those terms are scaled to 0–100.
 * The community stand-in weighs less than a rating the user set. Finish is
 * added afterwards, in points, so that bonus cannot shrink the other terms.
 */
export const SCORE_WEIGHTS = {
  personalRating: 40,
  communityRating: 16,
  genre: 25,
  creator: 15,
  investment: 12,
  finish: 8,
} as const;
