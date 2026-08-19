import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decodeChapterIdParam,
  encodeChapterId,
  findChapterIndex,
  mangaSlugKey,
} from "./source-id";

describe("chapter ids", () => {
  it("fully decodes Next.js chapter params", () => {
    assert.equal(
      decodeChapterIdParam("asurascans%3Athe-former-supreme-b60d532c%3A3"),
      "asurascans:the-former-supreme-b60d532c:3",
    );
    assert.equal(
      decodeChapterIdParam("asurascans%253Athe-former-supreme%253A3"),
      "asurascans:the-former-supreme:3",
    );
  });

  it("matches Asura chapters when the rotating slug hash changes", () => {
    const hashed = encodeChapterId(
      "asurascans",
      "the-former-supreme-b60d532c:3",
    );
    const clean = encodeChapterId("asurascans", "the-former-supreme:3");
    const chapters = [{ id: clean }];
    assert.equal(mangaSlugKey("the-former-supreme-b60d532c"), "the-former-supreme");
    assert.equal(findChapterIndex(chapters, hashed), 0);
    assert.equal(findChapterIndex(chapters, encodeURIComponent(hashed)), 0);
  });
});
