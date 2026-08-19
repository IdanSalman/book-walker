import type { ReaderChapter } from "@/lib/reader/types";

export type ChapterGap = {
  start: number;
  end: number;
};

export type ChapterListRow =
  | { type: "chapter"; chapter: ReaderChapter; sourceIndex: number }
  | { type: "gap"; gap: ChapterGap };

function numberedValue(chapterNumber: number): number | null {
  return chapterNumber >= 0 ? chapterNumber : null;
}

/**
 * Integers not covered by either chapter number. A decimal like 3.1 counts as
 * chapter 3 existing, so 2 → 3.1 has no gap and 1 → 3.1 is only 2.
 */
export function missingIntegersBetween(
  a: number,
  b: number,
): ChapterGap | null {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const start = Math.floor(lo) + 1;
  const end = Math.floor(hi) - 1;
  if (end < start) return null;
  return { start, end };
}

export function gapSize(gap: ChapterGap): number {
  return gap.end - gap.start + 1;
}

export function uniqueSortedChapterNumbers(
  chapters: ReaderChapter[],
): number[] {
  const numbers = new Set<number>();
  for (const chapter of chapters) {
    const value = numberedValue(chapter.chapterNumber);
    if (value != null) numbers.add(value);
  }
  return [...numbers].sort((left, right) => left - right);
}

/** Integers from chapter 1 up to (but not including) the first numbered chapter. */
export function leadingChapterGap(chapters: ReaderChapter[]): ChapterGap | null {
  const numbers = uniqueSortedChapterNumbers(chapters);
  if (numbers.length === 0) return null;
  return missingIntegersBetween(0, numbers[0]!);
}

/** Count of missing integer chapters across the whole list. */
export function missingChapterCount(chapters: ReaderChapter[]): number {
  const numbers = uniqueSortedChapterNumbers(chapters);
  let missing = 0;
  const leading = leadingChapterGap(chapters);
  if (leading) missing += gapSize(leading);
  for (let index = 1; index < numbers.length; index += 1) {
    const gap = missingIntegersBetween(numbers[index - 1]!, numbers[index]!);
    if (gap) missing += gapSize(gap);
  }
  return missing;
}

export function formatChapterGap(gap: ChapterGap): string {
  if (gap.start === gap.end) {
    return `Missing chapter ${gap.start}`;
  }
  return `Missing chapters ${gap.start}–${gap.end}`;
}

export function isChapterRead(
  chapter: ReaderChapter,
  chaptersRead: number,
  sourceIndex: number,
): boolean {
  if (chaptersRead <= 0) return false;
  const value = numberedValue(chapter.chapterNumber);
  if (value != null) {
    return Math.floor(value) <= chaptersRead;
  }
  return sourceIndex < chaptersRead;
}

/** First unread chapter, or the last one when the user is caught up. */
export function continueChapterIndex(
  chaptersRead: number,
  chapters: ReaderChapter[],
): number {
  if (chapters.length <= 0) return 0;
  if (chaptersRead <= 0) return 0;

  const next = chapters.findIndex((chapter, index) => {
    const value = numberedValue(chapter.chapterNumber);
    if (value != null) return Math.floor(value) > chaptersRead;
    return index >= chaptersRead;
  });
  if (next >= 0) return next;
  return chapters.length - 1;
}

export function readerProgressValue(
  chapter: ReaderChapter,
  sourceIndex: number,
): number {
  const value = numberedValue(chapter.chapterNumber);
  if (value != null) {
    return Math.max(1, Math.floor(value));
  }
  return sourceIndex + 1;
}

/** Highest numbered chapter, or the list length when chapters are unnumbered. */
export function latestChapterNumber(chapters: ReaderChapter[]): number {
  const numbers = uniqueSortedChapterNumbers(chapters);
  if (numbers.length === 0) return Math.max(1, chapters.length);
  return Math.max(1, Math.floor(numbers[numbers.length - 1]!));
}

function numbersMatch(a: number, b: number): boolean {
  return a >= 0 && b >= 0 && Math.abs(a - b) < 0.001;
}

/**
 * Next/previous chapter for reader navigation, skipping extra copies of the
 * same chapter number (different scanlation groups).
 */
export function adjacentDistinctChapter(
  chapters: ReaderChapter[],
  currentIndex: number,
  direction: -1 | 1,
): ReaderChapter | null {
  const current = chapters[currentIndex];
  if (!current || currentIndex < 0) return null;
  for (
    let index = currentIndex + direction;
    index >= 0 && index < chapters.length;
    index += direction
  ) {
    const candidate = chapters[index]!;
    if (!numbersMatch(current.chapterNumber, candidate.chapterNumber)) {
      return candidate;
    }
  }
  return null;
}

/** Oldest → newest rows with gap markers between numbered jumps. */
export function chapterListRows(chapters: ReaderChapter[]): ChapterListRow[] {
  const rows: ChapterListRow[] = [];
  const leading = leadingChapterGap(chapters);
  if (leading) {
    rows.push({ type: "gap", gap: leading });
  }

  for (let index = 0; index < chapters.length; index += 1) {
    const chapter = chapters[index]!;
    if (index > 0) {
      const previous = chapters[index - 1]!;
      const previousNumber = numberedValue(previous.chapterNumber);
      const currentNumber = numberedValue(chapter.chapterNumber);
      if (
        previousNumber != null &&
        currentNumber != null &&
        currentNumber > previousNumber
      ) {
        const gap = missingIntegersBetween(previousNumber, currentNumber);
        if (gap) {
          rows.push({ type: "gap", gap });
        }
      }
    }
    rows.push({ type: "chapter", chapter, sourceIndex: index });
  }

  return rows;
}
