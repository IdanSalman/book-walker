import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ReaderSourceEngine } from "@/lib/reader/source-engine";
import type { ResolvedManga } from "@/lib/reader/types";

import {
  chapterCountFromStoredSource,
  matchStoredSource,
  refreshCaughtUpChapterCounts,
  type CaughtUpBook,
} from "./caught-up-chapters";

function resolved(key: string, name: string, chapterNumber: number): ResolvedManga {
  return {
    manga: {
      id: key,
      title: name,
      originalLanguage: null,
      contentRating: null,
    },
    chapters: [
      {
        id: `${key}-ch`,
        name: `Ch. ${chapterNumber}`,
        chapterNumber,
        volume: null,
        title: null,
        scanlationGroup: null,
        publishedAt: null,
        pageCount: 1,
      },
    ],
    sourceKey: key,
    sourceName: name,
    sourceUrl: null,
  };
}

function engine(
  key: string,
  name: string,
  hosts: string[],
  calls: string[],
  chapterNumber: number | Error,
): ReaderSourceEngine {
  return {
    key,
    name,
    aliases: [],
    hosts,
    imageHosts: hosts,
    async search() {
      calls.push(`${key}:search`);
      return [];
    },
    async resolveManga() {
      calls.push(key);
      if (chapterNumber instanceof Error) throw chapterNumber;
      return resolved(key, name, chapterNumber);
    },
    async getPageList() {
      return [];
    },
  };
}

function book(partial: Partial<CaughtUpBook> & Pick<CaughtUpBook, "id" | "title">): CaughtUpBook {
  return {
    totalPages: 1,
    externalId: null,
    sourceUrl: null,
    sourceName: null,
    ...partial,
  };
}

describe("matchStoredSource", () => {
  const calls: string[] = [];
  const asura = engine("asurascans", "Asura Scans", ["asurascans.com"], calls, 4);
  const weeb = engine("weebcentral", "Weeb Central", ["weebcentral.com"], calls, 9);

  it("prefers the saved URL over a different source name", () => {
    const match = matchStoredSource([asura, weeb], {
      sourceUrl: "https://weebcentral.com/series/abc",
      sourceName: "Asura Scans",
    });
    assert.equal(match?.key, "weebcentral");
  });

  it("uses the source name only when no URL is stored", () => {
    const match = matchStoredSource([weeb, asura], {
      sourceUrl: null,
      sourceName: "Asura Scans",
    });
    assert.equal(match?.key, "asurascans");
  });

  it("does not fall back to the name when the URL matches no source", () => {
    const match = matchStoredSource([asura, weeb], {
      sourceUrl: "https://example.com/manga/1",
      sourceName: "Weeb Central",
    });
    assert.equal(match, undefined);
  });
});

describe("chapterCountFromStoredSource", () => {
  it("reads the matched source and does not search the others", async () => {
    const calls: string[] = [];
    const asura = engine("asurascans", "Asura Scans", ["asurascans.com"], calls, 4);
    const weeb = engine("weebcentral", "Weeb Central", ["weebcentral.com"], calls, 40);
    const count = await chapterCountFromStoredSource(
      {
        title: "Example",
        sourceUrl: "https://weebcentral.com/series/abc",
        sourceName: "Asura Scans",
        externalId: "anilist:1",
      },
      [asura, weeb],
    );
    assert.equal(count, 40);
    assert.deepEqual(calls, ["weebcentral"]);
  });

  it("stops when the saved source fails instead of trying another", async () => {
    const calls: string[] = [];
    const asura = engine(
      "asurascans",
      "Asura Scans",
      ["asurascans.com"],
      calls,
      new Error("source down"),
    );
    const weeb = engine("weebcentral", "Weeb Central", ["weebcentral.com"], calls, 40);
    await assert.rejects(
      () =>
        chapterCountFromStoredSource(
          {
            title: "Example",
            sourceUrl: "https://asurascans.com/manga/example",
            sourceName: "Weeb Central",
            externalId: "anilist:9",
          },
          [weeb, asura],
        ),
      /source down/,
    );
    assert.deepEqual(calls, ["asurascans"]);
  });

  it("uses one MangaDex chapter lookup and does not resolve the full list", async () => {
    const calls: string[] = [];
    const dex = engine("mangadex", "MangaDex", ["mangadex.org"], calls, 500);
    const count = await chapterCountFromStoredSource(
      {
        title: "Long Series",
        sourceUrl:
          "https://mangadex.org/title/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        sourceName: "Asura Scans",
        externalId: "anilist:3",
      },
      [dex],
      { latestMangaDexChapterNumber: async () => 900 },
    );
    assert.equal(count, 900);
    assert.deepEqual(calls, []);
  });

  it("rejects a MangaDex page URL without searching by title", async () => {
    const calls: string[] = [];
    const dex = engine("mangadex", "MangaDex", ["mangadex.org"], calls, 10);
    await assert.rejects(
      () =>
        chapterCountFromStoredSource(
          {
            title: "Something",
            sourceUrl: "https://mangadex.org/about",
            sourceName: "MangaDex",
            externalId: "anilist:1",
          },
          [dex],
        ),
      /Invalid MangaDex URL/,
    );
    assert.deepEqual(calls, []);
  });
});

describe("refreshCaughtUpChapterCounts", () => {
  it("records a failed title without calling any other source", async () => {
    const calls: string[] = [];
    const asura = engine(
      "asurascans",
      "Asura Scans",
      ["asurascans.com"],
      calls,
      new Error("source down"),
    );
    const weeb = engine("weebcentral", "Weeb Central", ["weebcentral.com"], calls, 12);
    const persisted: string[] = [];
    const result = await refreshCaughtUpChapterCounts(
      [
        book({
          id: "new",
          title: "Has chapters",
          totalPages: 3,
          sourceUrl: "https://weebcentral.com/series/abc",
          sourceName: "Asura Scans",
        }),
        book({
          id: "same",
          title: "Caught up",
          totalPages: 12,
          sourceUrl: "https://weebcentral.com/series/same",
          sourceName: "Asura Scans",
        }),
        book({
          id: "down",
          title: "Broken",
          sourceUrl: "https://asurascans.com/manga/b",
          sourceName: "Weeb Central",
          externalId: "anilist:9",
        }),
        book({
          id: "other",
          title: "Unknown host",
          sourceUrl: "https://example.com/manga/1",
          sourceName: "Weeb Central",
        }),
      ],
      [asura, weeb],
      {
        persistIncrease: async (entry) => {
          persisted.push(entry.id);
        },
      },
    );

    assert.equal(result.checked, 2);
    assert.equal(result.withNewChapters, 1);
    assert.deepEqual(result.updatedBookIds, ["new"]);
    assert.deepEqual(persisted, ["new"]);
    assert.equal(result.errors.length, 2);
    assert.ok(result.errors.some((error) => error.includes("Broken: source down")));
    assert.ok(
      result.errors.some((error) =>
        error.includes("Unknown host: No saved reading source"),
      ),
    );
    assert.deepEqual(calls.filter((call) => !call.endsWith(":search")).sort(), [
      "asurascans",
      "weebcentral",
      "weebcentral",
    ]);
  });

  it("keeps at most two checks in flight per host and six overall", async () => {
    let active = 0;
    let maxActive = 0;
    const hostActive = new Map<string, number>();
    let maxHost = 0;

    function tracked(key: string, host: string): ReaderSourceEngine {
      return {
        key,
        name: key,
        aliases: [],
        hosts: [host],
        imageHosts: [host],
        async search() {
          return [];
        },
        async resolveManga() {
          active += 1;
          maxActive = Math.max(maxActive, active);
          const next = (hostActive.get(host) ?? 0) + 1;
          hostActive.set(host, next);
          maxHost = Math.max(maxHost, next);
          await new Promise((resolve) => setTimeout(resolve, 20));
          hostActive.set(host, (hostActive.get(host) ?? 1) - 1);
          active -= 1;
          return resolved(key, key, 2);
        },
        async getPageList() {
          return [];
        },
      };
    }

    const hosts = ["weebcentral.com", "asurascans.com", "comick.art"];
    const engines = hosts.map((host, index) => tracked(`src-${index}`, host));
    const books = hosts.flatMap((host, hostIndex) =>
      [0, 1, 2, 3].map((n) =>
        book({
          id: `${hostIndex}-${n}`,
          title: `${host} ${n}`,
          totalPages: 5,
          sourceUrl: `https://${host}/series/${n}`,
        }),
      ),
    );

    const result = await refreshCaughtUpChapterCounts(books, engines);
    assert.equal(result.checked, books.length);
    assert.equal(result.errors.length, 0);
    assert.equal(maxHost, 2);
    assert.equal(maxActive, 6);
  });
});
