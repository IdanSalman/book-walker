import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  filterMihonCatalog,
  flattenMihonIndex,
  popularUnconfiguredSources,
} from "./mihon-catalog";

const LIVE_INDEX = [
  {
    name: "Tachiyomi: Outdated App",
    pkg: "eu.kanade.tachiyomi.extension.all.outdated",
    version: "1.0.0",
    nsfw: 0,
    sources: [
      {
        name: "Outdated App",
        lang: "en",
        id: "1",
        baseUrl: "https://example.com",
      },
    ],
  },
  {
    name: "Tachiyomi: ComicK",
    pkg: "eu.kanade.tachiyomi.extension.all.comick",
    version: "1.4.3",
    nsfw: 0,
    sources: [
      {
        name: "ComicK",
        lang: "all",
        id: "2",
        baseUrl: "https://comick.dev",
      },
    ],
  },
  {
    name: "Tachiyomi: MangaNato",
    pkg: "eu.kanade.tachiyomi.extension.en.manganato",
    version: "1.2.0",
    nsfw: 0,
    sources: [
      {
        name: "MangaNato",
        lang: "en",
        id: "3",
        baseUrl: "https://www.manganato.gg",
      },
    ],
  },
  {
    name: "Tachiyomi: NicheScans",
    pkg: "eu.kanade.tachiyomi.extension.en.nichescans",
    version: "1.0.0",
    nsfw: 0,
    sources: [
      {
        name: "NicheScans",
        lang: "en",
        id: "4",
        baseUrl: "https://nichescans.example",
      },
    ],
  },
];

describe("flattenMihonIndex", () => {
  it("reads the live array catalog and skips outdated stubs", () => {
    const sources = flattenMihonIndex(LIVE_INDEX);
    assert.deepEqual(
      sources.map((source) => source.name).sort(),
      ["ComicK", "MangaNato", "NicheScans"],
    );
    const nato = sources.find((source) => source.name === "MangaNato");
    assert.equal(nato?.baseUrl, "https://www.manganato.gg");
    assert.equal(nato?.suggestedKey, "manganato");
    assert.equal(nato?.popularRank, 5);
    assert.ok(nato?.iconUrl?.includes("eu.kanade.tachiyomi.extension.en.manganato"));
  });

  it("skips Mihon upgrade stubs", () => {
    const sources = flattenMihonIndex([
      {
        name: "Update to Mihon 0.20.1+",
        pkg: "eu.kanade.tachiyomi.extension.all.mihon",
        version: "1.4.1",
        nsfw: 0,
        sources: [
          {
            name: "Update to Mihon 0.20.1+",
            lang: "all",
            id: "1",
            baseUrl: "https://mihon.app",
          },
        ],
      },
    ]);
    assert.equal(sources.length, 0);
  });

  it("still accepts the nested extensionList shape", () => {
    const sources = flattenMihonIndex({
      extensionList: {
        extensions: [
          {
            name: "Weeb Central",
            packageName: "eu.kanade.tachiyomi.extension.en.weebcentral",
            versionName: "1.0.0",
            sources: [
              {
                name: "Weeb Central",
                language: "en",
                homeUrl: "https://weebcentral.com",
              },
            ],
          },
        ],
      },
    });
    assert.equal(sources[0]?.suggestedKey, "weebcentral");
    assert.equal(sources[0]?.popularRank, 3);
  });
});

describe("popularUnconfiguredSources", () => {
  it("returns ranked English sources that are not already added", () => {
    const catalog = flattenMihonIndex(LIVE_INDEX);
    const picks = popularUnconfiguredSources(catalog, [
      {
        key: "comick",
        name: "Comick",
        baseUrl: "https://comick.dev",
        language: "en",
      },
    ]);
    assert.deepEqual(
      picks.map((source) => source.suggestedKey),
      ["manganato"],
    );
  });

  it("sorts popular sources ahead of the rest", () => {
    const catalog = flattenMihonIndex(LIVE_INDEX);
    const filtered = filterMihonCatalog(
      catalog,
      { lang: "en", status: "available", sort: "popular", page: 1 },
      [],
    );
    assert.equal(filtered[0]?.suggestedKey, "comick");
    assert.equal(filtered[1]?.suggestedKey, "manganato");
    assert.equal(filtered.at(-1)?.name, "NicheScans");
  });
});
