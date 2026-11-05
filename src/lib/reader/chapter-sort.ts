import type { ReaderChapter } from "@/lib/reader/types";

/**
 * Prefer an explicit chapter label over the first digit in the string.
 * "The Strongest Level 0 … Chapter 12" is chapter 12, and "Chapter 0" stays 0.
 */
const LABELED_CHAPTER =
  /\b(?:chapters?|chaps?|ch|episodes?|eps?)\.?\s*#?\s*(\d+(?:\.\d+)?)/gi;

const VOLUME_LABEL = /\bvol(?:ume)?s?\.?\s*(\d+(?:\.\d+)?)/i;

export function labeledChapterNumber(
  value: string | null | undefined,
): number | null {
  if (!value) return null;
  const matches = [...value.matchAll(LABELED_CHAPTER)];
  const last = matches.at(-1);
  if (!last?.[1]) return null;
  const parsed = Number.parseFloat(last[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function volumeRank(chapter: ReaderChapter): number | null {
  const fromField = labeledLooseNumber(chapter.volume);
  if (fromField != null) return fromField;
  const match = chapter.name.match(VOLUME_LABEL);
  if (!match?.[1]) return null;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function labeledLooseNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/(\d+(?:\.\d+)?)/);
  if (!match?.[1]) return null;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function withChapterNumber(chapter: ReaderChapter): ReaderChapter {
  const labeled = labeledChapterNumber(chapter.name);
  if (labeled == null || labeled === chapter.chapterNumber) return chapter;
  return { ...chapter, chapterNumber: labeled };
}

/**
 * Oldest → newest by volume, then chapter number.
 * Chapter 0 stays first even when it was uploaded after later chapters.
 * Unnumbered extras keep their relative order at the end.
 */
export function sortReaderChapters(chapters: ReaderChapter[]): ReaderChapter[] {
  return chapters
    .map((chapter, index) => ({ chapter: withChapterNumber(chapter), index }))
    .sort((left, right) => {
      const a = left.chapter.chapterNumber;
      const b = right.chapter.chapterNumber;
      const aNumbered = a >= 0;
      const bNumbered = b >= 0;
      if (aNumbered !== bNumbered) return aNumbered ? -1 : 1;
      if (aNumbered && bNumbered) {
        const aVolume = volumeRank(left.chapter);
        const bVolume = volumeRank(right.chapter);
        if (aVolume != null && bVolume != null && aVolume !== bVolume) {
          return aVolume - bVolume;
        }
        if (a !== b) return a - b;
      }
      return left.index - right.index;
    })
    .map((item) => item.chapter);
}
