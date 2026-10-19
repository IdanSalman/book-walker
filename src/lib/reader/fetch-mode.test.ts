import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isSourceSearchUrl } from "./fetch-mode";

describe("isSourceSearchUrl", () => {
  it("treats title searches as uncacheable and leaves browse listings alone", () => {
    assert.equal(
      isSourceSearchUrl(
        "https://www.mgeko.cc/search/?search=overgeared&results=1",
      ),
      true,
    );
    assert.equal(
      isSourceSearchUrl(
        "https://www.mgeko.cc/browse-comics/data/?page=1&sort=popular_all_time&safe_mode=1",
      ),
      false,
    );
    assert.equal(
      isSourceSearchUrl(
        "https://www.mgeko.cc/browse-comics/data/?page=1&q=overgeared",
      ),
      true,
    );
    assert.equal(
      isSourceSearchUrl(
        "https://weebcentral.com/search/data?text=&sort=Popularity",
      ),
      false,
    );
    assert.equal(
      isSourceSearchUrl("https://weebcentral.com/search/data?text=naruto"),
      true,
    );
    assert.equal(
      isSourceSearchUrl(
        "https://mangakakalot.com/search/story/one_piece?page=1",
      ),
      true,
    );
    assert.equal(
      isSourceSearchUrl("https://example.com/?s=one+piece&post_type=wp-manga"),
      true,
    );
    assert.equal(
      isSourceSearchUrl(
        "https://example.com/manga/?page=1&order=popular&title=solo",
      ),
      true,
    );
    assert.equal(
      isSourceSearchUrl("https://api.comick.fun/v1.0/search?page=1&limit=24"),
      false,
    );
    assert.equal(
      isSourceSearchUrl(
        "https://api.comick.fun/v1.0/search?q=naruto&page=1&limit=24",
      ),
      true,
    );
  });
});
