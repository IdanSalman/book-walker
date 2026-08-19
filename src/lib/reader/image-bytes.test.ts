import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isCompleteImageBytes, sniffImageContentType } from "./image-bytes";
import {
  mangaDexUploadsUrl,
  parseMangaDexAtHomePath,
} from "./mangadex-page-image";

function pngWithIend(truncated = false): Uint8Array {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = [
    0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0,
    0, 0, 0, 0,
  ];
  const iend = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
  return Uint8Array.from(
    truncated ? [...signature, ...ihdr] : [...signature, ...ihdr, ...iend],
  );
}

describe("reader image bytes", () => {
  it("rejects truncated PNGs that MangaDex nodes sometimes serve", () => {
    assert.equal(isCompleteImageBytes(pngWithIend(true)), false);
    assert.equal(isCompleteImageBytes(pngWithIend(false)), true);
  });

  it("requires a JPEG end marker", () => {
    const truncated = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...Array(24).fill(0)]);
    const complete = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe0, ...Array(24).fill(0), 0xff, 0xd9,
    ]);
    assert.equal(isCompleteImageBytes(truncated), false);
    assert.equal(isCompleteImageBytes(complete), true);
    assert.equal(sniffImageContentType(complete, ""), "image/jpeg");
  });
});

describe("MangaDex at-home paths", () => {
  it("maps a node URL onto uploads.mangadex.org", () => {
    const url = new URL(
      "https://cmdxd98sb0x3y.mangadex.network/data/abc123/1-a.png",
    );
    const parsed = parseMangaDexAtHomePath(url);
    assert.deepEqual(parsed, {
      quality: "data",
      hash: "abc123",
      file: "1-a.png",
    });
    assert.equal(
      mangaDexUploadsUrl(parsed!),
      "https://uploads.mangadex.org/data/abc123/1-a.png",
    );
  });
});
