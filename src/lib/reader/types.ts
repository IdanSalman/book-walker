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

export function continueChapterIndex(
  currentPage: number,
  chapterCount: number,
): number {
  if (chapterCount <= 0) return 0;
  if (currentPage <= 0) return 0;
  return Math.min(currentPage - 1, chapterCount - 1);
}

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
