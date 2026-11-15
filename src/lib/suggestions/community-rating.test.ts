import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  communityLookupKey,
  mangaDexCommunityRating,
  openLibraryCommunityRating,
  parseMangaDexStatistics,
  parseOpenLibraryRatings,
} from "./community-rating";

const MANGADEX_ID = "a1b2c3d4-e5f6-4123-8abc-def012345678";

describe("communityLookupKey", () => {
  it("uses a MangaDex id from the title URL", () => {
    assert.deepEqual(
      communityLookupKey({
        sourceName: "Asura Scans",
        sourceUrl: `https://mangadex.org/title/${MANGADEX_ID}`,
        externalId: null,
      }),
      { kind: "mangadex", id: MANGADEX_ID },
    );
  });

  it("uses a MangaDex external id only when that source is named", () => {
    assert.deepEqual(
      communityLookupKey({
        sourceName: "MangaDex",
        sourceUrl: null,
        externalId: MANGADEX_ID,
      }),
      { kind: "mangadex", id: MANGADEX_ID },
    );
    assert.equal(
      communityLookupKey({
        sourceName: "Weeb Central",
        sourceUrl: "https://weebcentral.com/series/abc",
        externalId: MANGADEX_ID,
      }),
      null,
    );
  });

  it("uses an Open Library work key from the external id", () => {
    assert.deepEqual(
      communityLookupKey({
        sourceName: "Open Library",
        sourceUrl: null,
        externalId: "works/OL123W",
      }),
      { kind: "openlibrary", id: "OL123W" },
    );
  });
});

describe("community rating parsers", () => {
  it("maps a MangaDex Bayesian score onto five stars", () => {
    const rating = mangaDexCommunityRating(8.4);
    assert.ok(rating);
    assert.equal(rating.stars, 4.2);
    assert.equal(rating.label, "MangaDex 8.4");
    assert.equal(mangaDexCommunityRating(0), null);

    const parsed = parseMangaDexStatistics({
      statistics: {
        [MANGADEX_ID]: { rating: { bayesian: 8.4, average: 8.5 } },
        "missing-score": { rating: { bayesian: null } },
      },
    });
    assert.equal(parsed.get(MANGADEX_ID)?.label, "MangaDex 8.4");
    assert.equal(parsed.has("missing-score"), false);
  });

  it("keeps an Open Library average only when enough people rated it", () => {
    assert.equal(openLibraryCommunityRating(4.5, 4), null);
    const rating = openLibraryCommunityRating(4.25, 12);
    assert.ok(rating);
    assert.equal(rating.stars, 4.25);
    assert.equal(rating.label, "Open Library 4.3");
    assert.deepEqual(
      parseOpenLibraryRatings({ summary: { average: 4.25, count: 12 } }),
      rating,
    );
    assert.equal(parseOpenLibraryRatings({ summary: { average: 4, count: 2 } }), null);
  });
});
