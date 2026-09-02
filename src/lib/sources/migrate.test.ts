import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CatalogCandidate } from "@/lib/reader/types";
import {
  candidateMatchScore,
  selectMigrationHits,
} from "./migrate";

function hit(title: string, url: string): CatalogCandidate {
  return {
    id: url,
    title,
    summary: "",
    coverUrl: null,
    publicationStatus: "UNKNOWN",
    year: null,
    genres: [],
    isAdult: false,
    author: null,
    artist: null,
    lastChapter: null,
    url,
  };
}

describe("migration search hits", () => {
  it("scores exact and partial titles", () => {
    assert.equal(candidateMatchScore("Dune", "Dune"), 4);
    assert.equal(candidateMatchScore("Dune", "Dune Messiah"), 3);
    assert.equal(candidateMatchScore("Dune", "Children of Dune"), 2);
    assert.equal(candidateMatchScore("Dune", "Pride and Prejudice"), 0);
  });

  it("matches shared significant words when the full title is not a substring", () => {
    assert.ok(
      candidateMatchScore(
        "Omniscient Reader Viewpoint",
        "Omniscient Reader's Viewpoint",
      ) > 0,
    );
    assert.ok(
      candidateMatchScore(
        "High School Baseball Tycoon",
        "High School Baseball Tycoon Rise of a Legend",
      ) > 0,
    );
  });

  it("drops unrelated popular listings and the current URL", () => {
    const selected = selectMigrationHits(
      "Dune",
      [
        hit("Solo Leveling", "https://example.com/solo"),
        hit("Omniscient Reader", "https://example.com/orv"),
        hit("Dune", "https://openlibrary.org/works/OL893481W"),
        hit("Dune Messiah", "https://openlibrary.org/works/OL123W"),
        hit("Pride and Prejudice", "https://example.com/pride"),
        hit("Dune", "https://archive.org/details/dune00herbert"),
      ],
      "https://archive.org/details/dune00herbert",
    );

    assert.deepEqual(
      selected.map((item) => item.title),
      ["Dune", "Dune Messiah"],
    );
  });
});
