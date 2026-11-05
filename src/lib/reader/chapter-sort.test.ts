import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { labeledChapterNumber, sortReaderChapters } from "./chapter-sort";
import { parseChapterNumber } from "./source-fetch";
import type { ReaderChapter } from "./types";

function chapter(
  name: string,
  chapterNumber: number,
  extra: Partial<ReaderChapter> = {},
): ReaderChapter {
  return {
    id: name,
    name,
    chapterNumber,
    volume: null,
    title: null,
    scanlationGroup: null,
    publishedAt: null,
    pageCount: 0,
    ...extra,
  };
}

describe("labeledChapterNumber", () => {
  it("reads the chapter label instead of Level 0 in the series title", () => {
    const title =
      "The Strongest Level 0 Absolute Supremacy Through Analysis Skills Chapter 12";
    assert.equal(labeledChapterNumber(title), 12);
    assert.equal(parseChapterNumber(title), 12);
    assert.equal(parseChapterNumber("Chapter 0"), 0);
    assert.equal(parseChapterNumber("Ch.64"), 64);
    assert.equal(parseChapterNumber("64"), 64);
  });
});

describe("sortReaderChapters", () => {
  it("puts a late-uploaded Chapter 0 before the numbered run", () => {
    const chapters = [
      chapter("Chapter 38", 38, { publishedAt: "2026-04-28T00:00:00.000Z" }),
      chapter("Chapter 0", 0, { publishedAt: "2026-04-25T00:00:00.000Z" }),
      chapter("Chapter 37", 37, { publishedAt: "2026-04-21T00:00:00.000Z" }),
      chapter("Chapter 1", 1, { publishedAt: "2025-12-21T00:00:00.000Z" }),
      chapter(
        "The Strongest Level 0 Absolute Supremacy Through Analysis Skills Chapter 64",
        0,
        { publishedAt: "2026-10-26T00:00:00.000Z" },
      ),
    ];

    assert.deepEqual(
      sortReaderChapters(chapters).map((item) => item.chapterNumber),
      [0, 1, 37, 38, 64],
    );
  });

  it("keeps duplicate numbers in source order and extras at the end", () => {
    const chapters = [
      chapter("Extra", -1, { id: "extra" }),
      chapter("Chapter 2", 2, { id: "2b" }),
      chapter("Chapter 2", 2, { id: "2a" }),
      chapter("Chapter 1", 1, { id: "1" }),
    ];

    assert.deepEqual(
      sortReaderChapters(chapters).map((item) => item.id),
      ["1", "2b", "2a", "extra"],
    );
  });

  it("orders volumes before comparing chapter numbers", () => {
    const chapters = [
      chapter("Vol.2 Ch.1", 1, { volume: "2" }),
      chapter("Vol.1 Ch.3", 3, { volume: "1" }),
      chapter("Vol.1 Ch.1", 1, { volume: "1" }),
    ];

    assert.deepEqual(
      sortReaderChapters(chapters).map((item) => item.name),
      ["Vol.1 Ch.1", "Vol.1 Ch.3", "Vol.2 Ch.1"],
    );
  });
});
