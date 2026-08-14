/** Sources that are primarily adult content. */
const ADULT_SOURCE_PATTERNS = [
  "nhentai",
  "manhwa18",
  "manhwahentai",
  "coomer",
  "hentai",
  "18comic",
  "hitomi",
  "e-hentai",
  "exhentai",
];

/** Genre tags that mark a title as adult regardless of source. */
const ADULT_GENRE_TAGS = new Set(
  ["adult", "hentai", "pornographic", "smut", "sexual violence", "erotica"].map(
    (g) => g.toLowerCase(),
  ),
);

export function isAdultSource(sourceName: string | null | undefined): boolean {
  if (!sourceName?.trim()) return false;
  const normalized = sourceName.toLowerCase();
  return ADULT_SOURCE_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function hasAdultGenre(genres: string[] | null | undefined): boolean {
  if (!genres?.length) return false;
  return genres.some((genre) => ADULT_GENRE_TAGS.has(genre.toLowerCase()));
}

export function classifyAdult(
  sourceName: string | null | undefined,
  genres: string[] | null | undefined,
): boolean {
  return isAdultSource(sourceName) || hasAdultGenre(genres);
}

/** Prisma `where` fragment — omit adult titles when the user preference is on. */
export function hideAdultBookFilter(hideAdult: boolean) {
  return hideAdult ? { isAdult: false } : {};
}

/** Prisma `UserBook` filter that hides adult catalog titles. */
export function hideAdultUserBookFilter(hideAdult: boolean) {
  return hideAdult ? { book: { isAdult: false } } : {};
}

export function shouldHideAdultBook(hideAdult: boolean, isAdult: boolean) {
  return hideAdult && isAdult;
}

export type StoreContentFilter = "all" | "safe" | "adult";

export function parseStoreContentFilter(
  value: string | undefined,
  hideAdult: boolean,
): StoreContentFilter {
  if (hideAdult) return "safe";
  if (value === "adult") return "adult";
  if (value === "safe") return "safe";
  return "all";
}

export function storeContentFilter(
  filter: StoreContentFilter,
): { isAdult?: boolean } {
  if (filter === "adult") return { isAdult: true };
  if (filter === "safe") return { isAdult: false };
  return {};
}
