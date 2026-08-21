/**
 * Weeb Central, modeled on Mihon's WeebCentral extension
 * (keiyoushi/extensions-source .../weebcentral/WeebCentral.kt).
 * This is the Mihon replacement for MangaSee / MangaLife.
 */

import {
  parseChapterNumber,
  sourceText,
} from "@/lib/reader/source-fetch";
import { encodeChapterId, titlesMatch } from "@/lib/reader/source-id";
import type { ReaderSourceEngine } from "@/lib/reader/source-engine";
import type {
  CatalogCandidate,
  ReaderChapter,
  ResolvedManga,
} from "@/lib/reader/types";
import type {
  SourceBrowsePage,
  SourceBrowseQuery,
  SourceCategory,
} from "@/lib/sources/browse";

const SITE = "https://weebcentral.com";
const PAGE_SIZE = 32;

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

const WEEB_CENTRAL_TAGS: SourceCategory[] = [
  "Action",
  "Adult",
  "Adventure",
  "Comedy",
  "Doujinshi",
  "Drama",
  "Ecchi",
  "Fantasy",
  "Gender Bender",
  "Harem",
  "Hentai",
  "Historical",
  "Horror",
  "Isekai",
  "Josei",
  "Lolicon",
  "Martial Arts",
  "Mature",
  "Mecha",
  "Mystery",
  "Psychological",
  "Romance",
  "School Life",
  "Sci-fi",
  "Seinen",
  "Shotacon",
  "Shoujo",
  "Shoujo Ai",
  "Shounen",
  "Shounen Ai",
  "Slice of Life",
  "Smut",
  "Sports",
  "Supernatural",
  "Tragedy",
  "Yaoi",
  "Yuri",
  "Other",
].map((name) => ({ id: name, name }));

const HIDDEN_ADULT_TAGS = new Set([
  "adult",
  "hentai",
  "lolicon",
  "shotacon",
  "smut",
]);

const ADULT_TAGS = WEEB_CENTRAL_TAGS.filter((tag) =>
  HIDDEN_ADULT_TAGS.has(tag.name.toLowerCase()),
).map((tag) => tag.id);

function coverFromHtml(html: string): string | null {
  const normal = html.match(
    /https:\/\/[^"'\\\s]+\/cover\/normal\/[^"'\\\s]+/i,
  )?.[0];
  if (normal) return normal;
  const fallback = html.match(
    /https:\/\/[^"'\\\s]+\/cover\/fallback\/[^"'\\\s]+/i,
  )?.[0];
  if (fallback) return fallback;
  const srcset = html
    .match(/srcset="(https:[^"]+)"/i)?.[1]
    ?.split(/\s+/)[0]
    ?.replace("small", "normal");
  return srcset && /^https?:\/\//i.test(srcset) ? srcset : null;
}

function seriesIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(
    /weebcentral\.com\/series\/([^/?#]+)/i,
  );
  return match?.[1] ?? null;
}

function chapterName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim() || "Chapter";
}

async function searchHits(
  query: string,
  options: {
    sort?: SourceBrowseQuery["sort"];
    categoryId?: string;
    page?: number;
    hideAdult?: boolean;
  } = {},
): Promise<SourceBrowsePage> {
  const page = Math.max(options.page ?? 1, 1);
  const text = query.replace(/[!#:(),-]/g, " ").trim();
  const params = new URLSearchParams();
  params.set("text", text);
  params.set(
    "sort",
    text
      ? "Best Match"
      : options.sort === "latest"
        ? "Recently Added"
        : options.sort === "updated"
          ? "Latest Updates"
          : "Popularity",
  );
  params.set("order", "Descending");
  params.set("official", "Any");
  params.set("adult", options.hideAdult ? "False" : "Any");
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String((page - 1) * PAGE_SIZE));
  params.set("display_mode", "Full Display");
  if (options.categoryId) params.append("included_tag", options.categoryId);
  if (options.hideAdult) {
    for (const tag of ADULT_TAGS) params.append("excluded_tag", tag);
  }

  const html = await sourceText(`${SITE}/search/data?${params.toString()}`, {
    referer: `${SITE}/`,
    revalidate: 300,
  });

  const cards = html.split(/<article\b[^>]*\bbg-base-300\b/i).slice(1);
  const hits: CatalogCandidate[] = [];
  const seen = new Set<string>();
  for (const block of cards) {
    const href = block.match(
      /href="(https:\/\/weebcentral\.com\/series\/[^"]+)"/i,
    )?.[1];
    const title =
      block.match(
        /class="[^"]*line-clamp-1[^"]*"[^>]*>\s*([^<]+?)\s*</i,
      )?.[1] ??
      block.match(
        /class="text-ellipsis[^"]*"[^>]*>\s*([^<]+?)\s*</i,
      )?.[1] ??
      block.match(/\/series\/[^/]+\/([^"]+)"/i)?.[1]?.replace(/-/g, " ");
    const cover = coverFromHtml(block);
    if (!href || !title) continue;
    const id = href.split("/series/")[1]?.split("/")[0];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    hits.push({
      id,
      title: decodeHtml(title.trim()),
      summary: "Imported from Weeb Central.",
      coverUrl: cover,
      publicationStatus: "UNKNOWN",
      year: null,
      genres: [],
      isAdult: false,
      author: null,
      artist: null,
      lastChapter: null,
      url: href,
    });
  }

  const hasMore = /<button\b/i.test(html) || hits.length >= PAGE_SIZE;
  return { items: hits, page, hasMore };
}

async function browseWeebCentral(
  query: SourceBrowseQuery,
): Promise<SourceBrowsePage> {
  return searchHits(query.query ?? "", {
    sort: query.sort,
    categoryId: query.categoryId,
    page: query.page,
    hideAdult: query.hideAdult,
  });
}

function weebCentralCategories(hideAdult = true): SourceCategory[] {
  return hideAdult
    ? WEEB_CENTRAL_TAGS.filter(
        (tag) => !HIDDEN_ADULT_TAGS.has(tag.name.toLowerCase()),
      )
    : WEEB_CENTRAL_TAGS;
}

async function fetchSeriesCandidate(id: string): Promise<CatalogCandidate> {
  const html = await sourceText(`${SITE}/series/${id}`, {
    referer: `${SITE}/`,
    revalidate: 300,
  });
  const title =
    decodeHtml(html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim() ?? id);
  const cover = coverFromHtml(html);
  const description =
    html.match(/Description[\s\S]*?<p[^>]*>([^<]+)<\/p>/i)?.[1]?.trim() ??
    "Imported from Weeb Central.";
  return {
    id,
    title,
    summary: description.slice(0, 4000),
    coverUrl: cover,
    publicationStatus: "UNKNOWN",
    year: null,
    genres: [],
    isAdult: false,
    author: null,
    artist: null,
    lastChapter: null,
    url:
      html.match(/https:\/\/weebcentral\.com\/series\/[^"]+/)?.[0] ??
      `${SITE}/series/${id}`,
  };
}

async function fetchChapters(seriesId: string): Promise<ReaderChapter[]> {
  const html = await sourceText(`${SITE}/series/${seriesId}/full-chapter-list`, {
    referer: `${SITE}/`,
    revalidate: 300,
  });

  const matches = [
    ...html.matchAll(
      /href="(\/chapters\/([^"]+))"[^>]*>[\s\S]*?<span class="">([^<]+)<\/span>/g,
    ),
  ];

  const chapters = matches.map((match) => {
    const payload = match[2];
    const name = chapterName(match[3]);
    return {
      id: encodeChapterId("weebcentral", payload),
      name,
      chapterNumber: parseChapterNumber(name),
      volume: null,
      title: null,
      scanlationGroup: null,
      publishedAt: null,
      pageCount: 0,
    } satisfies ReaderChapter;
  });

  return chapters.reverse();
}

export const weebCentralEngine: ReaderSourceEngine = {
  key: "weebcentral",
  name: "Weeb Central",
  aliases: ["WeebCentral", "MangaSee", "MangaLife", "MangaSee123"],
  hosts: ["weebcentral.com"],
  imageHosts: [
    "weebcentral.com",
    "lastation.us",
    "planeptune.us",
    "lowee.us",
    "leanbox.us",
    "compsci88.com",
  ],
  imageReferer: `${SITE}/`,

  async search(query) {
    const fromUrl = seriesIdFromUrl(query);
    if (fromUrl) return [await fetchSeriesCandidate(fromUrl)];
    const trimmed = query.trim();
    if (/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(trimmed)) {
      return [await fetchSeriesCandidate(trimmed)];
    }
    const page = await browseWeebCentral({
      sort: "popular",
      query: trimmed,
      page: 1,
      limit: PAGE_SIZE,
      hideAdult: false,
    });
    return page.items;
  },

  browse: browseWeebCentral,
  categories: (hideAdult) => Promise.resolve(weebCentralCategories(hideAdult)),

  getById: fetchSeriesCandidate,

  async resolveManga(book): Promise<ResolvedManga> {
    const fromUrl = seriesIdFromUrl(book.sourceUrl);
    let seriesId = fromUrl;
    let title = book.title;

    if (!seriesId) {
      const hits = (await searchHits(book.title)).items;
      const match =
        hits.find((hit) => titlesMatch(hit.title, book.title)) ?? hits[0];
      if (!match) {
        throw new Error("No Weeb Central listing was found for this title.");
      }
      seriesId = match.id;
      title = match.title;
    }

    const chapters = await fetchChapters(seriesId);
    return {
      manga: {
        id: seriesId,
        title,
        originalLanguage: null,
        contentRating: null,
      },
      chapters,
      sourceKey: "weebcentral",
      sourceName: "Weeb Central",
      sourceUrl: `${SITE}/series/${seriesId}`,
    };
  },

  async getPageList(payload) {
    const html = await sourceText(
      `${SITE}/chapters/${payload}/images?is_prev=False&reading_style=long_strip`,
      { referer: `${SITE}/`, revalidate: false },
    );
    const urls = [
      ...html.matchAll(/<img[^>]+src="(https:[^"]+)"/g),
    ].map((match) => match[1]);
    if (urls.length === 0) {
      throw new Error("Chapter pages are unavailable");
    }
    return urls.map((url, index) => ({ index, url }));
  },
};
