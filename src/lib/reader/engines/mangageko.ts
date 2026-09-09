/**
 * MangaGeko (Mihon: MangaGeko / mangarawclub). Title search uses
 * /search/?search= (full catalog). Browse / Latest / genre filters use
 * /browse-comics/data/, which is a smaller index on the site.
 */

import {
  absUrl,
  assertNotBlocked,
  attr,
  decodeHtml,
  imageFromTag,
  mapPublicationStatus,
  originOf,
  pathOf,
  stripTags,
  withTrailingSlash,
} from "@/lib/reader/html";
import {
  parseChapterNumber,
  sourceText,
  uniqueUrls,
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

export const MANGAGEKO_KEY = "mangageko";
export const MANGAGEKO_NAME = "MangaGeko";
const SITE = "https://www.mgeko.cc";
const PAGE_SIZE = 24;

const HOSTS = ["mgeko.cc", "mgeko.com", "mangageko.com", "mangagecko.com"];

const GENRES: SourceCategory[] = [
  "Action",
  "Adventure",
  "Comedy",
  "Cooking",
  "Manga",
  "Drama",
  "Fantasy",
  "Gender bender",
  "Harem",
  "Historical",
  "Horror",
  "Isekai",
  "Josei",
  "Manhua",
  "Manhwa",
  "Martial arts",
  "Mature",
  "Mecha",
  "Medical",
  "Mystery",
  "One shot",
  "Psychological",
  "Romance",
  "School life",
  "Sci fi",
  "Seinen",
  "Shoujo",
  "Shounen",
  "Slice of life",
  "Sports",
  "Supernatural",
  "Tragedy",
  "Webtoons",
  "Ladies",
].map((name) => ({ id: name, name }));

const HIDDEN_ADULT_GENRES = new Set(["mature"]);

type BrowseData = {
  results_html?: string;
  pagination_html?: string;
  total_results?: number;
  page?: number;
  num_pages?: number;
};

function siteHost(host: string): string {
  return host.replace(/^www\./, "").toLowerCase();
}

export function isMangaGekoHost(host: string): boolean {
  const normalized = siteHost(host);
  return HOSTS.some(
    (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`),
  );
}

export function isMangaGekoSource(source: {
  key?: string;
  name?: string;
  baseUrl?: string;
}): boolean {
  const key = source.key?.toLowerCase().replace(/[^a-z0-9]+/g, "") ?? "";
  const name = source.name?.toLowerCase().replace(/[^a-z0-9]+/g, "") ?? "";
  if (
    key.includes("mangageko") ||
    key.includes("mangagecko") ||
    key === "mgeko" ||
    key.includes("mangarawclub")
  ) {
    return true;
  }
  if (
    name === "mangageko" ||
    name === "mangagecko" ||
    name === "mgeko" ||
    name === "mangaraw"
  ) {
    return true;
  }
  try {
    return isMangaGekoHost(new URL(source.baseUrl ?? SITE).hostname);
  } catch {
    return false;
  }
}

export function seriesIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const absolute = /^https?:\/\//i.test(url) ? url : `${SITE}${url.startsWith("/") ? url : `/${url}`}`;
    const parsed = new URL(absolute);
    if (/^https?:\/\//i.test(url) && !isMangaGekoHost(parsed.hostname)) {
      return null;
    }
    const slug = parsed.pathname.match(/\/manga\/([^/]+)/i)?.[1]?.replace(/\/+$/, "");
    if (!slug || /^(all-chapters|chapter)$/i.test(slug)) return null;
    return decodeURIComponent(slug);
  } catch {
    return null;
  }
}

function seriesUrl(id: string): string {
  return `${SITE}/manga/${id.replace(/^\/+|\/+$/g, "")}/`;
}

function origin(): string {
  return originOf(SITE);
}

function candidate(partial: {
  id: string;
  title: string;
  summary?: string;
  coverUrl?: string | null;
  publicationStatus?: CatalogCandidate["publicationStatus"];
  genres?: string[];
  isAdult?: boolean;
  author?: string | null;
  lastChapter?: string | null;
  url?: string;
}): CatalogCandidate {
  const genres = partial.genres ?? [];
  return {
    id: partial.id,
    title: partial.title,
    summary: (partial.summary ?? `Imported from ${MANGAGEKO_NAME}.`).slice(
      0,
      4000,
    ),
    coverUrl: partial.coverUrl ?? null,
    publicationStatus: partial.publicationStatus ?? "UNKNOWN",
    year: null,
    genres,
    isAdult: partial.isAdult ?? genres.some((genre) => HIDDEN_ADULT_GENRES.has(genre.toLowerCase())),
    author: partial.author ?? null,
    artist: null,
    lastChapter: partial.lastChapter ?? null,
    url: partial.url ?? seriesUrl(partial.id),
  };
}

function coverFromImgHtml(html: string): string | null {
  const tag = html.match(/<img\b[^>]*>/i)?.[0];
  return tag ? imageFromTag(tag, SITE) : null;
}

export function parseSearchListing(html: string): CatalogCandidate[] {
  const items: CatalogCandidate[] = [];
  const seen = new Set<string>();
  const blocks = html.split(/<li\b[^>]*\bnovel-item\b/i).slice(1);
  for (const block of blocks) {
    const href =
      block.match(/href=["']([^"']*\/manga\/[^"']+)["']/i)?.[1] ??
      block.match(/href=["']([^"']+)["']/i)?.[1];
    const url = absUrl(SITE, href);
    const id = seriesIdFromUrl(url ?? "");
    if (!id || seen.has(id)) continue;
    const title =
      stripTags(block.match(/<h4\b[^>]*novel-title[^>]*>([\s\S]*?)<\/h4>/i)?.[1] ?? "") ||
      attr(block.match(/<a\b[^>]*>/i)?.[0] ?? "", "title") ||
      "";
    if (!title) continue;
    seen.add(id);
    const author = stripTags(
      block.match(/Author\(S\):\s*([^<]+)/i)?.[1] ?? "",
    ).replace(/^updating$/i, "");
    const lastChapter = stripTags(
      block.match(/Chapters?\s+([^<]+)/i)?.[1] ?? "",
    )
      .replace(/-eng-li$/i, "")
      .trim();
    const summary =
      attr(block.match(/<div\b[^>]*\bsummary\b[^>]*>/i)?.[0] ?? "", "title") ||
      stripTags(block.match(/<div\b[^>]*\bsummary\b[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "");
    items.push(
      candidate({
        id,
        title,
        summary: summary ? decodeHtml(summary.replace(/<br\s*\/?>/gi, "\n")) : undefined,
        coverUrl: coverFromImgHtml(block),
        author: author || null,
        lastChapter: lastChapter || null,
        url: url ? withTrailingSlash(url) : seriesUrl(id),
      }),
    );
  }
  return items;
}

export function parseBrowseListing(html: string): CatalogCandidate[] {
  const items: CatalogCandidate[] = [];
  const seen = new Set<string>();
  const blocks = html.split(/<article\b[^>]*\bcomic-card\b/i).slice(1);
  for (const block of blocks) {
    const href = block.match(/href=["']([^"']*\/manga\/[^"']+)["']/i)?.[1];
    const url = absUrl(SITE, href);
    const id = seriesIdFromUrl(url ?? "");
    if (!id || seen.has(id)) continue;
    const title =
      stripTags(
        block.match(/<h3\b[^>]*comic-card__title[^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1] ??
          "",
      ) ||
      attr(block.match(/<img\b[^>]*>/i)?.[0] ?? "", "alt") ||
      "";
    if (!title) continue;
    seen.add(id);
    items.push(
      candidate({
        id,
        title,
        summary: stripTags(
          block.match(/<p\b[^>]*comic-card__description[^>]*>([\s\S]*?)<\/p>/i)?.[1] ??
            "",
        ),
        coverUrl: coverFromImgHtml(block),
        url: url ? withTrailingSlash(url) : seriesUrl(id),
      }),
    );
  }
  return items;
}

export function parseSeriesDetails(html: string, url: string): CatalogCandidate {
  const id = seriesIdFromUrl(url) ?? pathOf(url, SITE).split("/").filter(Boolean).at(-1) ?? url;
  const title =
    stripTags(html.match(/<h1\b[^>]*novel-title[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "") ||
    stripTags(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "") ||
    "Untitled";
  const rawDescription = stripTags(
    html.match(/<p\b[^>]*\bdescription\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "",
  );
  const summary = rawDescription.replace(/^[\s\S]*?\bSummary is\s*/i, "").trim();
  const author = (
    attr(html.match(/<div\b[^>]*\bauthor\b[\s\S]*?<a\b[^>]*>/i)?.[0] ?? "", "title") ||
    stripTags(html.match(/itemprop=["']author["'][^>]*>([\s\S]*?)<\//i)?.[1] ?? "")
  ).replace(/^updating$/i, "");
  const genres = [
    ...new Set(
      [...html.matchAll(/href=["'][^"']*genre[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)].map(
        (match) => stripTags(match[1]),
      ),
    ),
  ].filter((genre) => genre.length > 1 && genre.length < 40);
  const statusHtml =
    html.match(/<strong\b[^>]*class="[^"]*(?:completed|ongoing|hiatus)[^"]*"[^>]*>/i)?.[0] ??
    "";
  const status =
    /completed/i.test(statusHtml) ? "COMPLETED"
    : /hiatus/i.test(statusHtml) ? "HIATUS"
    : /ongoing/i.test(statusHtml) ? "ONGOING"
    : mapPublicationStatus(
        stripTags(html.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>\s*<small>\s*Status/i)?.[1] ?? ""),
      );
  const cover =
    imageFromTag(html.match(/<figure\b[^>]*\bcover\b[\s\S]*?<img\b[^>]*>/i)?.[0] ?? "", SITE) ??
    absUrl(
      SITE,
      html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1],
    );
  const lastChapter = stripTags(
    html.match(/<strong>[\s\S]*?<\/i>\s*([^<]+)<\/strong>\s*<small>\s*Chapters/i)?.[1] ??
      "",
  )
    .replace(/-eng-li$/i, "")
    .trim();

  return candidate({
    id,
    title,
    summary: summary || rawDescription,
    coverUrl: cover,
    publicationStatus: status,
    genres,
    author: author || null,
    lastChapter: lastChapter || null,
    url: withTrailingSlash(url.startsWith("http") ? url : seriesUrl(id)),
  });
}

function parseChapterDate(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const cleaned = raw
    .replace(/\./g, "")
    .replace(/\bSept\b/i, "Sep")
    .replace(/\s+/g, " ")
    .trim();
  const ms = Date.parse(cleaned);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function parseChapterList(html: string, sourceKey = MANGAGEKO_KEY): ReaderChapter[] {
  const items: ReaderChapter[] = [];
  const seen = new Set<string>();
  const blocks = html.split(/<li\b[^>]*>/i).slice(1);
  for (const block of blocks) {
    const href = block.match(/href=["']([^"']*\/reader\/[^"']+)["']/i)?.[1];
    if (!href) continue;
    const url = absUrl(SITE, href);
    if (!url) continue;
    const payload = pathOf(url, SITE);
    if (seen.has(payload)) continue;
    seen.add(payload);
    const rawName = stripTags(
      block.match(/<strong\b[^>]*chapter-title[^>]*>([\s\S]*?)<\/strong>/i)?.[1] ??
        block.match(/<[^>]*chapter-number[^>]*>([\s\S]*?)<\//i)?.[1] ??
        "",
    )
      .replace(/-eng-li$/i, "")
      .trim();
    const name = rawName ? `Chapter ${rawName}` : "Chapter";
    const datetime = attr(
      block.match(/<time\b[^>]*chapter-update[^>]*>/i)?.[0] ?? "",
      "datetime",
    );
    items.push({
      id: encodeChapterId(sourceKey, payload),
      name,
      chapterNumber: parseChapterNumber(rawName || name),
      volume: null,
      title: null,
      scanlationGroup: null,
      publishedAt: parseChapterDate(datetime),
      pageCount: 0,
    });
  }
  return items.reverse();
}

export function parseChapterPages(html: string): string[] {
  const start = html.search(/id=["']chapter-reader["']/i);
  const slice = start >= 0 ? html.slice(start) : html;
  const urls = uniqueUrls(
    [...slice.matchAll(/<img\b[^>]*>/gi)]
      .map((match) => imageFromTag(match[0], SITE))
      .filter((url): url is string => Boolean(url)),
  ).filter(
    (url) =>
      !/credits-mgeko|loading|logo_|\/static\/img\//i.test(url) &&
      (/imgsrv\d*\.com/i.test(url) ||
        /\/(?:comic|manga|media)\//i.test(url) ||
        /\.(jpe?g|png|webp|avif)(\?|$)/i.test(url)),
  );
  return urls;
}

function browseSortParam(sort: SourceBrowseQuery["sort"]): string {
  if (sort === "latest") return "recently_added";
  if (sort === "updated") return "latest";
  return "popular_all_time";
}

async function fetchHtml(url: string, revalidate: number | false = 300): Promise<string> {
  const html = await sourceText(url, {
    referer: `${origin()}/`,
    revalidate,
  });
  assertNotBlocked(html, MANGAGEKO_NAME);
  return html;
}

async function searchListing(
  query: string,
  page: number,
): Promise<SourceBrowsePage> {
  const params = new URLSearchParams({
    search: query.trim(),
    results: String(page),
  });
  const html = await fetchHtml(`${SITE}/search/?${params}`);
  const items = parseSearchListing(html);
  const hasMore =
    /nav[^>]*paging[\s\S]{0,800}Next/i.test(html) ||
    (items.length >= PAGE_SIZE &&
      new RegExp(`results=${page + 1}\\b`).test(html));
  return { items, page, hasMore };
}

async function browseListing(
  query: SourceBrowseQuery,
): Promise<SourceBrowsePage> {
  const page = Math.max(query.page, 1);
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("sort", browseSortParam(query.sort));
  params.set("safe_mode", query.hideAdult ? "1" : "0");
  if (query.query?.trim()) params.set("q", query.query.trim());
  if (query.categoryId) params.set("include_genres", query.categoryId);

  const raw = await sourceText(`${SITE}/browse-comics/data/?${params}`, {
    referer: `${origin()}/`,
    revalidate: 300,
    accept: "application/json,text/html;q=0.9,*/*;q=0.8",
  });
  let data: BrowseData;
  try {
    data = JSON.parse(raw) as BrowseData;
  } catch {
    throw new Error(`${MANGAGEKO_NAME}: browse listing was not JSON`);
  }
  const html = data.results_html ?? "";
  assertNotBlocked(html, MANGAGEKO_NAME);
  const items = parseBrowseListing(html);
  const totalPages = Number(data.num_pages) || 1;
  const current = Number(data.page) || page;
  return {
    items,
    page: current,
    hasMore: current < totalPages && items.length > 0,
    total: typeof data.total_results === "number" ? data.total_results : undefined,
  };
}

async function listing(query: SourceBrowseQuery): Promise<SourceBrowsePage> {
  const page = Math.max(query.page, 1);
  const text = query.query?.trim() ?? "";
  if (text && !query.categoryId) {
    return searchListing(text, page);
  }
  return browseListing({ ...query, page });
}

async function fetchSeriesCandidate(id: string): Promise<CatalogCandidate> {
  const url = seriesUrl(id);
  const html = await fetchHtml(url);
  if (!/novel-header|novel-title/i.test(html)) {
    throw new Error(`${MANGAGEKO_NAME}: page not found`);
  }
  return parseSeriesDetails(html, url);
}

async function fetchChapters(id: string): Promise<ReaderChapter[]> {
  const html = await fetchHtml(`${seriesUrl(id)}all-chapters/`);
  return parseChapterList(html);
}

export const mangaGekoEngine: ReaderSourceEngine = {
  key: MANGAGEKO_KEY,
  name: MANGAGEKO_NAME,
  aliases: ["MangaGecko", "Mgeko", "MangaRawClub", "MangaRaw"],
  hosts: HOSTS,
  imageHosts: [
    "mgeko.cc",
    "mgeko.com",
    "imgsrv1.com",
    "imgsrv2.com",
    "imgsrv3.com",
    "imgsrv4.com",
    "imgsrv5.com",
  ],
  imageReferer: `${origin()}/`,

  async search(query) {
    const fromUrl = seriesIdFromUrl(query);
    if (fromUrl) return [await fetchSeriesCandidate(fromUrl)];
    const trimmed = query.trim();
    if (!trimmed) return [];
    const page = await listing({
      sort: "popular",
      query: trimmed,
      page: 1,
      limit: PAGE_SIZE,
      hideAdult: false,
    });
    return page.items;
  },

  browse: listing,
  categories: (hideAdult) =>
    Promise.resolve(
      hideAdult
        ? GENRES.filter((genre) => !HIDDEN_ADULT_GENRES.has(genre.name.toLowerCase()))
        : GENRES,
    ),
  getById: fetchSeriesCandidate,

  async resolveManga(book): Promise<ResolvedManga> {
    const fromUrl = seriesIdFromUrl(book.sourceUrl);
    let seriesId = fromUrl;
    let title = book.title;
    let coverUrl: string | null | undefined;

    if (!seriesId) {
      const hits = await listing({
        sort: "popular",
        query: book.title,
        page: 1,
        limit: PAGE_SIZE,
        hideAdult: false,
      });
      const match =
        hits.items.find((hit) => titlesMatch(hit.title, book.title)) ??
        hits.items[0];
      if (!match) {
        throw new Error(`No ${MANGAGEKO_NAME} listing was found for “${book.title}”.`);
      }
      seriesId = match.id;
      title = match.title;
      coverUrl = match.coverUrl;
    }

    const [chapters, details] = await Promise.all([
      fetchChapters(seriesId),
      fetchSeriesCandidate(seriesId).catch(() => null),
    ]);
    if (chapters.length === 0) {
      throw new Error(`${MANGAGEKO_NAME}: no readable chapters`);
    }
    if (details) {
      title = details.title || title;
      coverUrl = details.coverUrl ?? coverUrl;
    }

    return {
      manga: {
        id: seriesId,
        title,
        originalLanguage: null,
        contentRating: details?.isAdult ? "pornographic" : null,
      },
      chapters,
      sourceKey: MANGAGEKO_KEY,
      sourceName: MANGAGEKO_NAME,
      sourceUrl: seriesUrl(seriesId),
      coverUrl,
    };
  },

  async getPageList(payload) {
    const url = payload.startsWith("http")
      ? payload
      : `${origin()}${payload.startsWith("/") ? payload : `/${payload}`}`;
    const html = await fetchHtml(withTrailingSlash(url), false);
    const urls = parseChapterPages(html);
    if (urls.length === 0) {
      throw new Error("Chapter pages are unavailable");
    }
    return urls.map((imageUrl, index) => ({ index, url: imageUrl }));
  },
};
