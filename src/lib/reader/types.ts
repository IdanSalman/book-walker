/**
 * Reader models aligned with Mihon's source/reader APIs
 * (eu.kanade.tachiyomi.source.model + ReadingMode).
 */

export type ReadingMode = "rtl" | "ltr" | "webtoon";
export type ReadingModePreference = "auto" | ReadingMode;

export const READING_MODE_PREFERENCES: ReadingModePreference[] = [
  "auto",
  "ltr",
  "rtl",
  "webtoon",
];

export type ReaderManga = {
  id: string;
  title: string;
  originalLanguage: string | null;
  contentRating: string | null;
};

export type ReaderChapter = {
  id: string;
  name: string;
  chapterNumber: number;
  volume: string | null;
  title: string | null;
  scanlationGroup: string | null;
  publishedAt: string | null;
  pageCount: number;
};

export type ReaderPage = {
  index: number;
  url: string;
  /** Overrides the source-level image Referer when pages come from another host. */
  referer?: string;
  /** Draw this page from a PDF document instead of a raster image. */
  render?: "pdf";
};

export type ResolvedManga = {
  manga: ReaderManga;
  chapters: ReaderChapter[];
  sourceKey: string;
  sourceName: string;
  sourceUrl: string | null;
  coverUrl?: string | null;
};

export type CatalogCandidate = {
  id: string;
  title: string;
  summary: string;
  coverUrl: string | null;
  publicationStatus: import("@prisma/client").PublicationStatus;
  year: number | null;
  genres: string[];
  isAdult: boolean;
  author: string | null;
  artist: string | null;
  lastChapter: string | null;
  url: string;
};

export function parseReadingMode(
  value: string | null | undefined,
): ReadingMode | null {
  if (value === "rtl" || value === "ltr" || value === "webtoon") return value;
  return null;
}

export function parseReadingModePreference(
  value: string | null | undefined,
): ReadingModePreference {
  if (value === "auto" || value === "rtl" || value === "ltr" || value === "webtoon") {
    return value;
  }
  return "auto";
}

export function defaultReadingMode(
  originalLanguage: string | null,
  userDefault?: string | null,
): ReadingMode {
  const preference = parseReadingMode(userDefault);
  if (preference) return preference;
  const lang = originalLanguage?.toLowerCase() ?? "";
  if (lang === "ko" || lang.startsWith("zh")) return "webtoon";
  return "rtl";
}

export function readingModeLabel(mode: ReadingMode): string {
  switch (mode) {
    case "rtl":
      return "Right to left";
    case "ltr":
      return "Left to right";
    case "webtoon":
      return "Webtoon";
  }
}

export function readingModePreferenceLabel(mode: ReadingModePreference): string {
  if (mode === "auto") return "Automatic";
  return readingModeLabel(mode);
}
