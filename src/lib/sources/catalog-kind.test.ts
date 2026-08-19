import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  catalogCategoryForCandidate,
  catalogCategoryForSource,
  catalogTitleKey,
  looksLikeLightNovel,
} from "./catalog-kind";

describe("catalog kind", () => {
  it("maps comic sources to manga and library sources to books", () => {
    assert.equal(catalogCategoryForSource({ key: "mangadex" }), "MANGA");
    assert.equal(catalogCategoryForSource({ key: "comick" }), "MANGA");
    assert.equal(catalogCategoryForSource({ key: "openlibrary" }), "BOOK");
    assert.equal(catalogCategoryForSource({ key: "internetarchive" }), "BOOK");
  });

  it("keeps the same title distinct across manga, novels, and books", () => {
    assert.notEqual(
      catalogTitleKey("Overlord", "MANGA"),
      catalogTitleKey("Overlord", "LIGHT_NOVEL"),
    );
    assert.notEqual(
      catalogTitleKey("Dune", "BOOK"),
      catalogTitleKey("Dune", "MANGA"),
    );
    assert.equal(
      catalogTitleKey("Dune", "BOOK"),
      catalogTitleKey(" dune ", "BOOK"),
    );
  });

  it("classifies light-novel tags without treating them as books", () => {
    assert.equal(looksLikeLightNovel(["Fantasy", "Light Novel"]), true);
    assert.equal(looksLikeLightNovel(["Action", "Drama"]), false);
    assert.equal(
      catalogCategoryForCandidate({ key: "mangadex" }, ["Light Novel"]),
      "LIGHT_NOVEL",
    );
    assert.equal(
      catalogCategoryForCandidate({ key: "openlibrary" }, ["Light Novel"]),
      "BOOK",
    );
  });
});
