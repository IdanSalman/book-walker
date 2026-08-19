import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canonicalizeToonilyPath,
  imageFromTag,
  looksLikeChapterPath,
  looksLikeSeriesPath,
  toonilyHdCoverUrl,
} from "./html";

describe("Toonily Madara paths", () => {
  it("treats /serie/slug as a series URL like Mihon mangaSubString", () => {
    assert.equal(looksLikeSeriesPath("/serie/secret-class-c62cd36e/"), true);
    assert.equal(
      looksLikeChapterPath("/serie/secret-class-c62cd36e/chapter-242/"),
      true,
    );
    assert.equal(looksLikeSeriesPath("/serie/secret-class-c62cd36e/chapter-242/"), false);
  });

  it("rewrites the legacy /webtoon/ path Toonily.kt still sees in library URLs", () => {
    assert.equal(
      canonicalizeToonilyPath("/webtoon/secret-class-c62cd36e/"),
      "/serie/secret-class-c62cd36e/",
    );
  });

  it("drops WordPress size suffixes on the static CDN", () => {
    assert.equal(
      toonilyHdCoverUrl(
        "https://static.tnlycdn.com/2025/05/cover-1-175x238.png",
      ),
      "https://static.tnlycdn.com/2025/05/cover-1.png",
    );
    const tag =
      '<img src="https://static.tnlycdn.com/2025/05/cover-1-175x238.png" alt="">';
    assert.equal(
      imageFromTag(tag, "https://toonily.com/"),
      "https://static.tnlycdn.com/2025/05/cover-1.png",
    );
  });
});
