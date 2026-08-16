/**
 * Reader models aligned with Mihon's source/reader APIs
 * (eu.kanade.tachiyomi.source.model + ReadingMode).
 */

export type ReadingMode = "rtl" | "ltr" | "webtoon";

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

export function defaultReadingMode(
  originalLanguage: string | null,
): ReadingMode {
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
