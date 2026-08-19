import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decodeScanPayload,
  encodeScanPayload,
  iaIdFromUrl,
  isOpenLibraryCatalogHit,
  isPublicEbook,
  openLibraryDocToCandidate,
  openLibraryWorkKey,
  pageImageUrl,
  pagesForScan,
  rankOpenLibraryCatalogDocs,
  scanIsReadable,
  shouldSkipIaIdentifier,
} from "./openlibrary-source";

describe("open library scan helpers", () => {
  it("parses Internet Archive and Open Library ids", () => {
    assert.equal(
      iaIdFromUrl("https://archive.org/details/prideprejudice00aust"),
      "prideprejudice00aust",
    );
    assert.equal(
      openLibraryWorkKey("openlibrary:/works/OL66554W"),
      "OL66554W",
    );
    assert.equal(openLibraryWorkKey("https://openlibrary.org/works/OL66554W"), "OL66554W");
  });

  it("skips audio and Gutenberg dump identifiers", () => {
    assert.equal(shouldSkipIaIdentifier("pride_and_prejudice_librivox"), true);
    assert.equal(shouldSkipIaIdentifier("prideandprejudic42671gut"), true);
    assert.equal(shouldSkipIaIdentifier("prideprejudice00aust"), false);
  });

  it("only treats public ebooks as readable", () => {
    assert.equal(isPublicEbook({ ebook_access: "public" }), true);
    assert.equal(isPublicEbook({ public_scan_b: true }), true);
    assert.equal(isPublicEbook({ ebook_access: "borrowable" }), false);
  });

  it("keeps commercial catalog titles with covers, not only public scans", () => {
    const atomic = {
      key: "/works/OL17590212W",
      title: "Atomic Habits",
      cover_i: 8378292,
      ebook_access: "borrowable",
    };
    const pride = {
      key: "/works/OL66554W",
      title: "Pride and Prejudice",
      ia: ["prideprejudice00aust"],
      ebook_access: "public",
      public_scan_b: true,
    };

    assert.equal(isOpenLibraryCatalogHit(atomic), true);
    assert.equal(
      isOpenLibraryCatalogHit({ title: "No Cover", ebook_access: "borrowable" }),
      false,
    );
    assert.equal(isOpenLibraryCatalogHit(pride), true);

    const ranked = rankOpenLibraryCatalogDocs(
      [pride, { ...atomic, title: "Atomic Habits Workbook" }, atomic],
      "Atomic Habits",
    );
    assert.equal(ranked[0]?.title, "Atomic Habits");

    const candidate = openLibraryDocToCandidate(atomic, "Atomic Habits");
    assert.equal(
      candidate.coverUrl,
      "https://covers.openlibrary.org/b/id/8378292-L.jpg",
    );
    assert.equal(candidate.url, "https://openlibrary.org/works/OL17590212W");
    assert.equal(
      openLibraryDocToCandidate(pride, "Pride and Prejudice").url.includes(
        "archive.org",
      ),
      true,
    );
  });

  it("rejects restricted or tiny scans", () => {
    assert.equal(
      scanIsReadable({
        metadata: {
          mediatype: "texts",
          imagecount: "518",
        },
      }),
      518,
    );
    assert.equal(
      scanIsReadable({
        metadata: {
          mediatype: "texts",
          imagecount: "400",
          "access-restricted-item": "true",
        },
      }),
      null,
    );
    assert.equal(
      scanIsReadable({
        metadata: { mediatype: "audio", imagecount: "20" },
      }),
      null,
    );
  });

  it("builds sequential page image URLs", () => {
    const pages = pagesForScan("prideprejudice00aust", 3, true);
    assert.equal(pages.length, 3);
    assert.equal(pages[0]?.url, pageImageUrl("prideprejudice00aust", 0, true));
    assert.match(pages[1]!.url, /n1_w800\.jpg$/);
    assert.equal(decodeScanPayload(encodeScanPayload("prideprejudice00aust", 518))?.pageCount, 518);
  });
});
