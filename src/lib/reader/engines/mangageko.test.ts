import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isMangaGekoSource,
  parseBrowseListing,
  parseChapterList,
  parseChapterPages,
  parseSearchListing,
  parseSeriesDetails,
  seriesIdFromUrl,
} from "./mangageko";

const SEARCH_HTML = `
<ul class="novel-list">
<li class="novel-item">
<a href="/manga/overgeared-mg1/" title="Overgeared">
<figure class="novel-cover">
<img class="lazy" src="/static/img/loading.gif" data-src="/media/manga_covers/over-gear-2.jpg" alt="Overgeared" />
</figure>
<h4 class="novel-title text2row">Overgeared</h4>
<h6 class="text1row">Author(S): Dong Wook Lee</h6>
<div class="novel-stats"><strong> Chapters 337-eng-li</strong></div>
<div class="summary truncate-fade" title="The world's greatest VR game">summary</div>
</a>
</li>
</ul>
`;

const BROWSE_HTML = `
<article class="comic-card">
  <div class="comic-card__cover">
    <a href="/manga/magic-emperor-mg1/">
      <img src="https://imgsrv5.com/avatar/288x412/media/manga_covers/cover.jpg" alt="Magic Emperor">
    </a>
  </div>
  <h3 class="comic-card__title">
    <a href="/manga/magic-emperor-mg1/">Magic Emperor</a>
  </h3>
  <p class="comic-card__description">Zhuo Yifan was a magic emperor</p>
</article>
`;

const SERIES_HTML = `
<header class="novel-header">
<figure class="cover">
<img class="lazy" src="https://imgsrv5.com/avatar/288x412/media/manga_covers/default-placeholder.png" data-src="https://imgsrv5.com/avatar/288x412/media/manga_covers/over-gear-2.jpg" alt="Overgeared" />
</figure>
<h1 itemprop="name" class="novel-title">Overgeared</h1>
<div class="author">
<a href="#" title="Dong Wook Lee"><span itemprop="author">Dong Wook Lee</span></a>
</div>
<div class="header-stats">
<strong class="ongoing">Ongoing</strong>
<small>Status</small>
</div>
<div class="categories">
<a href="/browse-comics/?genre_included=Action&minchaps=0">Action</a>
<a href="/browse-comics/?genre_included=Manhwa&minchaps=0">Manhwa</a>
</div>
</header>
<p class="description">You are reading on www.mgeko.cc. The Summary is<br><br>Grid is Overgeared.</p>
`;

const CHAPTERS_HTML = `
<ul class="chapter-list">
<li>
<a href="/reader/en/overgeared-mg1-chapter-337-eng-li/" title="Chapter 337">
<strong class="chapter-title">337-eng-li </strong>
<time class="chapter-update" datetime="Aug. 29, 2026, 2:53 a.m."></time>
</a>
</li>
<li>
<a href="/reader/en/overgeared-mg1-chapter-1-eng-li/">
<strong class="chapter-title">1-eng-li </strong>
</a>
</li>
</ul>
`;

const PAGES_HTML = `
<div id="chapter-reader">
<img src="https://imgsrv5.com/sv2/comic/overgeared-mg1/chapter-337/0.jpg" id="image-1">
<img src="https://imgsrv5.com/sv2/comic/overgeared-mg1/chapter-337/1.jpg" id="image-2">
<img src="https://www.mgeko.cc/static/img/credits-mgeko.png">
</div>
<img src="/static/img/logo_200x200.png" alt="logo">
`;

describe("MangaGeko parsers", () => {
  it("reads series ids from listing URLs and ignores other hosts", () => {
    assert.equal(
      seriesIdFromUrl("https://www.mgeko.cc/manga/overgeared-mg1/"),
      "overgeared-mg1",
    );
    assert.equal(seriesIdFromUrl("/manga/nano-machine-mg12"), "nano-machine-mg12");
    assert.equal(seriesIdFromUrl("https://mangadex.org/manga/abc"), null);
  });

  it("parses /search/ novel-item cards from the full catalog endpoint", () => {
    const items = parseSearchListing(SEARCH_HTML);
    assert.equal(items.length, 1);
    assert.equal(items[0]?.title, "Overgeared");
    assert.equal(items[0]?.id, "overgeared-mg1");
    assert.equal(items[0]?.author, "Dong Wook Lee");
    assert.equal(items[0]?.lastChapter, "337");
    assert.ok(items[0]?.coverUrl?.includes("over-gear-2.jpg"));
  });

  it("parses browse-comics comic-card HTML", () => {
    const items = parseBrowseListing(BROWSE_HTML);
    assert.equal(items[0]?.title, "Magic Emperor");
    assert.equal(items[0]?.id, "magic-emperor-mg1");
    assert.ok(items[0]?.coverUrl?.includes("imgsrv5.com"));
  });

  it("parses series metadata like Mihon mangaDetailsParse", () => {
    const details = parseSeriesDetails(
      SERIES_HTML,
      "https://www.mgeko.cc/manga/overgeared-mg1/",
    );
    assert.equal(details.title, "Overgeared");
    assert.equal(details.publicationStatus, "ONGOING");
    assert.deepEqual(details.genres, ["Action", "Manhwa"]);
    assert.equal(details.summary, "Grid is Overgeared.");
    assert.ok(details.coverUrl?.includes("over-gear-2.jpg"));
  });

  it("lists chapters oldest-first and strips the -eng-li suffix", () => {
    const chapters = parseChapterList(CHAPTERS_HTML);
    assert.equal(chapters[0]?.name, "Chapter 1");
    assert.equal(chapters[1]?.name, "Chapter 337");
    assert.equal(chapters[1]?.chapterNumber, 337);
    assert.ok(chapters[1]?.id.includes("/reader/en/overgeared-mg1-chapter-337-eng-li"));
  });

  it("reads page images from #chapter-reader and skips credits", () => {
    const pages = parseChapterPages(PAGES_HTML);
    assert.deepEqual(pages, [
      "https://imgsrv5.com/sv2/comic/overgeared-mg1/chapter-337/0.jpg",
      "https://imgsrv5.com/sv2/comic/overgeared-mg1/chapter-337/1.jpg",
    ]);
  });

  it("treats custom mgeko rows as the dedicated engine", () => {
    assert.equal(
      isMangaGekoSource({
        key: "mangagecko",
        name: "MangaGecko",
        baseUrl: "https://www.mgeko.cc",
      }),
      true,
    );
    assert.equal(
      isMangaGekoSource({
        key: "random",
        name: "Other",
        baseUrl: "https://toonily.com",
      }),
      false,
    );
  });
});
