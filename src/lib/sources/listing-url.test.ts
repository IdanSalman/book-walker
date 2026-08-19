import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  asuraCanonicalSlug,
  equivalentListingUrls,
  listingKey,
  listingsMatch,
} from "./listing-url";

describe("Asura listing URLs", () => {
  it("treats the site-wide public_url hash as the same series", () => {
    const listed = "https://asurascans.com/comics/hellogin-b60d532c";
    const stored = "https://asurascans.com/comics/hellogin";
    const comicNet = "https://asuracomic.net/series/hellogin-aaaaaaaa";

    assert.equal(asuraCanonicalSlug(listed), "hellogin");
    assert.equal(listingKey(listed), "asurascans:hellogin");
    assert.equal(listingsMatch(listed, stored), true);
    assert.equal(listingsMatch(listed, comicNet), true);
    assert.equal(
      listingsMatch(listed, "https://asurascans.com/comics/the-former-supreme-b60d532c"),
      false,
    );
  });

  it("includes slug variants for catalog lookups", () => {
    const urls = equivalentListingUrls(
      "https://asurascans.com/comics/hellogin-b60d532c",
    );
    assert.ok(urls.includes("https://asurascans.com/comics/hellogin"));
    assert.ok(urls.includes("https://asuracomic.net/series/hellogin"));
  });
});
