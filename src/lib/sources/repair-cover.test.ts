import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { enginesForBook, storedSourceFitsCategory } from "./repair-cover";

describe("cover repair engines", () => {
  it("searches only book sources for BOOK titles", () => {
    const keys = enginesForBook({
      category: "BOOK",
      sourceName: "Open Library",
      sourceUrl: "https://openlibrary.org/works/OL45883W",
    }).map((engine) => engine.key);

    assert.deepEqual(keys, ["openlibrary"]);
    assert.equal(keys.includes("mangadex"), false);
  });

  it("does not fall back to manga sites when a book has no source", () => {
    const keys = enginesForBook({
      category: "BOOK",
      sourceName: null,
      sourceUrl: null,
    }).map((engine) => engine.key);

    assert.ok(keys.includes("openlibrary"));
    assert.equal(keys.includes("mangadex"), false);
    assert.equal(keys.includes("comick"), false);
  });

  it("keeps manga cover search on comic sources", () => {
    const keys = enginesForBook({
      category: "MANGA",
      sourceName: "MangaDex",
      sourceUrl: "https://mangadex.org/title/abc",
    }).map((engine) => engine.key);

    assert.equal(keys[0], "mangadex");
    assert.ok(keys.includes("comick"));
    assert.equal(keys.includes("openlibrary"), false);
  });

  it("does not treat a Comick listing as a valid source for a BOOK", () => {
    assert.equal(
      storedSourceFitsCategory({
        category: "BOOK",
        sourceName: "Comick",
        sourceUrl: "https://comick.dev/comic/atomic-habits",
      }),
      false,
    );
    assert.equal(
      storedSourceFitsCategory({
        category: "BOOK",
        sourceName: "Open Library",
        sourceUrl: "https://openlibrary.org/works/OL17590212W",
      }),
      true,
    );
    assert.equal(
      storedSourceFitsCategory({
        category: "BOOK",
        sourceName: "Local PDF",
        sourceUrl: null,
      }),
      true,
    );
    assert.equal(
      enginesForBook({
        category: "BOOK",
        sourceName: "Comick",
        sourceUrl: "https://comick.dev/comic/atomic-habits",
      })
        .map((engine) => engine.key)
        .includes("comick"),
      false,
    );
  });

  it("does not search manga sites for a light novel unless that listing is stored", () => {
    assert.deepEqual(
      enginesForBook({
        category: "LIGHT_NOVEL",
        sourceName: "AniList",
        sourceUrl: "https://anilist.co/manga/1",
      }).map((engine) => engine.key),
      [],
    );
    assert.deepEqual(
      enginesForBook({
        category: "LIGHT_NOVEL",
        sourceName: "MangaDex",
        sourceUrl: "https://mangadex.org/title/abc",
      }).map((engine) => engine.key),
      ["mangadex"],
    );
  });
});
