import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { coverSrc, isMangaDexCoverUrl } from "./cover-url";

const COVER =
  "https://uploads.mangadex.org/covers/a1c7c817-4e59-43b7-9365-09675a149a6f/2f4aca53-64c7-46ac-ae85-3bc9b3169890.png";

describe("MangaDex cover URLs", () => {
  it("proxies thumbnails so the browser does not hit the uploads challenge", () => {
    const src = coverSrc(COVER, 256);
    assert.match(src, /^\/api\/reader\/image\?/);
    const params = new URLSearchParams(src.slice(src.indexOf("?") + 1));
    assert.equal(params.get("u"), `${COVER}.256.jpg`);
    assert.equal(params.get("r"), "https://mangadex.org/");
    assert.equal(isMangaDexCoverUrl(new URL(params.get("u")!)), true);
  });

  it("resizes an existing MangaDex thumbnail through the same proxy", () => {
    const src = coverSrc(`${COVER}.256.jpg`, 512);
    const params = new URLSearchParams(src.slice(src.indexOf("?") + 1));
    assert.equal(params.get("u"), `${COVER}.512.jpg`);
  });

  it("leaves covers that are not hotlink-protected as direct URLs", () => {
    assert.equal(
      coverSrc("https://cdn.example.com/cover.jpg"),
      "https://cdn.example.com/cover.jpg",
    );
  });

  it("does not treat chapter pages as covers", () => {
    assert.equal(
      isMangaDexCoverUrl(
        new URL("https://uploads.mangadex.org/data/abc123/1-a.png"),
      ),
      false,
    );
  });
});
