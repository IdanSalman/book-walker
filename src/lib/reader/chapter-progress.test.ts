import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chapterCountsAsRead, stripScrollCountsAsRead } from "./chapter-progress";

describe("chapterCountsAsRead", () => {
  it("does not count an unopened or empty chapter", () => {
    assert.equal(chapterCountsAsRead(-1, 10), false);
    assert.equal(chapterCountsAsRead(0, 0), false);
  });

  it("does not count only the first page of a longer chapter", () => {
    assert.equal(chapterCountsAsRead(0, 2), false);
    assert.equal(chapterCountsAsRead(0, 20), false);
    assert.equal(chapterCountsAsRead(8, 20), false);
  });

  it("counts a chapter after 50% of its pages", () => {
    assert.equal(chapterCountsAsRead(9, 20), true);
    assert.equal(chapterCountsAsRead(1, 3), true);
  });

  it("counts a chapter on the last page", () => {
    assert.equal(chapterCountsAsRead(0, 1), true);
    assert.equal(chapterCountsAsRead(1, 2), true);
    assert.equal(chapterCountsAsRead(19, 20), true);
  });
});

describe("stripScrollCountsAsRead", () => {
  it("does not count the top of a long strip", () => {
    assert.equal(stripScrollCountsAsRead(0, 800, 10_000), false);
    assert.equal(stripScrollCountsAsRead(2_000, 800, 10_000), false);
  });

  it("does not count a strip that still fits on screen", () => {
    assert.equal(stripScrollCountsAsRead(0, 800, 800), false);
    assert.equal(stripScrollCountsAsRead(0, 800, 804), false);
  });

  it("counts a strip after scrolling halfway or to the end", () => {
    assert.equal(stripScrollCountsAsRead(4_600, 800, 10_000), true);
    assert.equal(stripScrollCountsAsRead(9_200, 800, 10_000), true);
  });
});
