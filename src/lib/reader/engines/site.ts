/**
 * Generic Mihon-style HTML source. Detects Madara or MangaThemesia
 * (the two most common scanlation themes) and falls back to link scraping.
 */

import {
  absUrl,
  assertNotBlocked,
  attr,
  cssBackgroundUrl,
  decodeHtml,
  detectMangaDirectory,
  detectSiteParser,
  hostOf,
  imageFromTag,
  isKeyoappHost,
  isMangaBoxHost,
  looksLikeChapterPath,
  looksLikeSeriesPath,
  mapPublicationStatus,
  originOf,
  pathOf,
  stripTags,
  withTrailingSlash,
  type SiteParser,
} from "@/lib/reader/html";
import {
  fetchMangaBoxChapters,
  mangaboxHostsCompatible,
  mangaboxListingHtml,
  mangaboxOrigin,
  pagesFromMangaBox,
  parseMangaBoxListing,
} from "@/lib/reader/engines/mangabox";
import {
  keyoappListingHtml,
  pagesFromKeyoapp,
  parseKeyoappChapters,
  parseKeyoappDetails,
  parseKeyoappListing,
} from "@/lib/reader/engines/keyoapp";
import {
  parseChapterNumber,
  sourcePost,
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
} from "@/lib/sources/browse";

export type SiteSourceConfig = {
  key: string;
  name: string;
  baseUrl: string;
  isAdultSource?: boolean;
};

const PAGE_SIZE = 24;
const parserCache = new Map<string, Promise<SiteParser>>();

function siteOrigin(baseUrl: string): string {
  return originOf(baseUrl);
}

function siteHost(baseUrl: string): string {
  return hostOf(baseUrl);
}

function hostsCompatible(urlHost: string, sourceHost: string): boolean {
  const a = urlHost.replace(/^www\./, "").toLowerCase();
  const b = sourceHost.replace(/^www\./, "").toLowerCase();
  if (a === b) return true;
  return mangaboxHostsCompatible(a, b);
}

function seriesIdFromUrl(url: string, baseUrl: string): string | null {
  try {
    const parsed = new URL(url, baseUrl);
    if (!hostsCompatible(parsed.hostname, siteHost(baseUrl))) {
      return null;
    }
    if (!looksLikeSeriesPath(parsed.pathname)) return null;
    return pathOf(parsed.toString(), baseUrl);
  } catch {
    return null;
  }
}

function urlFromId(id: string, baseUrl: string): string {
  if (/^https?:\/\//i.test(id)) {
    try {
      const parsed = new URL(id);
      if (hostsCompatible(parsed.hostname, siteHost(baseUrl))) {
        const working = new URL(siteOrigin(baseUrl));
        parsed.protocol = working.protocol;
        parsed.host = working.host;
        return parsed.toString();
      }
    } catch {
      return id;
    }
    return id;
  }
  return new URL(id.startsWith("/") ? id : `/${id}`, siteOrigin(baseUrl)).toString();
}

async function pageHtml(
  url: string,
  baseUrl: string,
  sourceName: string,
  revalidate: number | false = 300,
): Promise<string> {
  const html = await sourceText(url, {
    referer: withTrailingSlash(siteOrigin(baseUrl)),
    revalidate,
  });
  assertNotBlocked(html, sourceName);
  return html;
}

async function detectParser(
  baseUrl: string,
  sourceName: string,
): Promise<SiteParser> {
  const key = siteOrigin(baseUrl);
  const cached = parserCache.get(key);
  if (cached) return cached;

  const pending = (async () => {
    if (isMangaBoxHost(siteHost(baseUrl))) return "mangabox" as const;
    if (isKeyoappHost(siteHost(baseUrl))) return "keyoapp" as const;
    try {
      const html = await pageHtml(withTrailingSlash(key), baseUrl, sourceName, 3600);
      return detectSiteParser(html, siteHost(baseUrl));
    } catch {
      return "generic" as const;
    }
  })();
  parserCache.set(key, pending);
  return pending;
}

function titleFromAnchor(block: string, href: string): string | null {
  const titled = block.match(
    new RegExp(`href=["']${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>([\\s\\S]*?)</a>`, "i"),
  )?.[1];
  if (titled && stripTags(titled)) return stripTags(titled);
  const heading = block.match(/<(?:h[1-6]|span|div)[^>]*class="[^"]*(?:title|tt|post-title|name)[^"]*"[^>]*>([\s\S]*?)<\//i)?.[1];
  if (heading && stripTags(heading)) return stripTags(heading);
  const alt = block.match(/alt="([^"]+)"/i)?.[1];
  return alt ? decodeHtml(alt.trim()) : null;
}

function coverFromBlock(block: string, baseUrl: string): string | null {
  const fromCss = cssBackgroundUrl(block, baseUrl);
  if (fromCss) return fromCss;
  const images = [...block.matchAll(/<img\b[^>]*>/gi)].map((match) =>
    imageFromTag(match[0], baseUrl),
  );
  return images.find((url) => url != null) ?? null;
}

function parseListing(
  html: string,
  baseUrl: string,
  sourceName: string,
  isAdult: boolean,
): CatalogCandidate[] {
  const origin = siteOrigin(baseUrl);
  const seen = new Set<string>();
  const items: CatalogCandidate[] = [];

  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    const href = absUrl(origin, match[1]);
    if (!href) continue;
    let parsed: URL;
    try {
      parsed = new URL(href);
    } catch {
      continue;
    }
    if (!hostsCompatible(parsed.hostname, siteHost(baseUrl))) continue;
    if (match[1] === "#" || parsed.pathname === "/") continue;
    if (!looksLikeSeriesPath(parsed.pathname)) continue;
    const id = pathOf(parsed.toString(), baseUrl);
    const start = match.index ?? 0;
    const innerEnd = html.slice(start, start + 2500).search(/<\/a>/i);
    const block = html.slice(
      start,
      start + (innerEnd >= 0 ? innerEnd + 4 : 900),
    );
    const cover = coverFromBlock(block, origin);
    if (seen.has(id)) {
      const existing = items.find((item) => item.id === id);
      if (existing && !existing.coverUrl && cover) existing.coverUrl = cover;
      continue;
    }
    const title = titleFromAnchor(block, match[1]) ?? titleFromAnchor(block, href);
    if (!title || /read more|view all|next|prev/i.test(title)) continue;

    seen.add(id);
    items.push({
      id,
      title,
      summary: `Imported from ${sourceName}.`,
      coverUrl: coverFromBlock(block, origin),
      publicationStatus: "UNKNOWN",
      year: null,
      genres: [],
      isAdult,
      author: null,
      artist: null,
      lastChapter: null,
      url: `${origin}${id}/`,
    });
  }

  return items;
}

function parseDetails(
  html: string,
  url: string,
  baseUrl: string,
  sourceName: string,
  isAdult: boolean,
): CatalogCandidate {
  const origin = siteOrigin(baseUrl);
  const title =
    stripTags(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "") ||
    decodeHtml(
      html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1] ?? "",
    ) ||
    pathOf(url, baseUrl).split("/").filter(Boolean).at(-1)?.replace(/-/g, " ") ||
    "Untitled";
  const description =
    stripTags(
      html.match(
        /<(?:div|p)[^>]*(?:description|entry-content|desc|summary)[^>]*>([\s\S]*?)<\/(?:div|p)>/i,
      )?.[1] ?? "",
    ) ||
    decodeHtml(
      html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)?.[1] ??
        "",
    ) ||
    `Imported from ${sourceName}.`;
  const cover =
    cssBackgroundUrl(html.slice(0, 16000), origin) ??
    absUrl(
      origin,
      html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1],
    ) ??
    imageFromTag(html.match(/<img\b[^>]*(?:thumb|cover|wp-post-image)[^>]*>/i)?.[0] ?? "", origin);
  const status = mapPublicationStatus(
    stripTags(
      html.match(
        /(?:status|estado|statut)[^<]{0,40}<\/(?:td|span|div|h[1-6])>\s*<[^>]+>([\s\S]*?)</i,
      )?.[1] ?? "",
    ),
  );
  const genres = [
    ...html.matchAll(
      /href=["'][^"']*(?:genre|genres|tag)[^"']*["'][^>]*>([^<]+)</gi,
    ),
  ]
    .map((match) => stripTags(match[1]))
    .filter((genre) => genre.length > 1 && genre.length < 40)
    .slice(0, 16);

  return {
    id: pathOf(url, baseUrl),
    title,
    summary: description.slice(0, 4000),
    coverUrl: cover,
    publicationStatus: status,
    year: null,
    genres,
    isAdult,
    author: null,
    artist: null,
    lastChapter: null,
    url: withTrailingSlash(url.startsWith("http") ? url : `${origin}${url}`),
  };
}

async function madaraSearchHtml(
  baseUrl: string,
  sourceName: string,
  query: string,
  page: number,
  sort: SourceBrowseQuery["sort"],
): Promise<string> {
  const origin = siteOrigin(baseUrl);
  const dir = detectMangaDirectory(
    await pageHtml(withTrailingSlash(origin), baseUrl, sourceName, 3600).catch(
      () => "",
    ),
    origin,
  );
  if (query.trim()) {
    const params = new URLSearchParams({
      s: query.trim(),
      post_type: "wp-manga",
    });
    const path = page > 1 ? `/page/${page}/` : "/";
    return pageHtml(`${origin}${path}?${params}`, baseUrl, sourceName);
  }
  const order = sort === "latest" || sort === "updated" ? "latest" : "views";
  const suffix = page > 1 ? `page/${page}/` : "";
  return pageHtml(
    `${origin}/${dir}/${suffix}?m_orderby=${order}`,
    baseUrl,
    sourceName,
  );
}

async function themesiaSearchHtml(
  baseUrl: string,
  sourceName: string,
  query: string,
  page: number,
  sort: SourceBrowseQuery["sort"],
): Promise<string> {
  const origin = siteOrigin(baseUrl);
  const dir = detectMangaDirectory(
    await pageHtml(withTrailingSlash(origin), baseUrl, sourceName, 3600).catch(
      () => "",
    ),
    origin,
  );
  const order =
    sort === "latest" || sort === "updated" ? "update" : "popular";
  const params = new URLSearchParams({
    page: String(page),
    order,
  });
  if (query.trim()) params.set("title", query.trim());
  try {
    return await pageHtml(
      `${origin}/${dir}/?${params}`,
      baseUrl,
      sourceName,
    );
  } catch {
    const fallback = new URLSearchParams({ s: query.trim() });
    return pageHtml(`${origin}/?${fallback}`, baseUrl, sourceName);
  }
}

async function genericSearchHtml(
  baseUrl: string,
  sourceName: string,
  query: string,
  page: number,
): Promise<string> {
  const origin = siteOrigin(baseUrl);
  if (query.trim()) {
    const params = new URLSearchParams({ s: query.trim() });
    if (page > 1) params.set("page", String(page));
    return pageHtml(`${origin}/?${params}`, baseUrl, sourceName);
  }
  return pageHtml(
    page > 1 ? `${origin}/page/${page}/` : withTrailingSlash(origin),
    baseUrl,
    sourceName,
  );
}

function parseChaptersFromHtml(
  html: string,
  baseUrl: string,
  sourceKey: string,
): ReaderChapter[] {
  const origin = siteOrigin(baseUrl);
  const seen = new Set<string>();
  const chapters: ReaderChapter[] = [];

  const madaraItems = [
    ...html.matchAll(/<li\b[^>]*wp-manga-chapter[^>]*>([\s\S]*?)<\/li>/gi),
  ];
  const themesiaItems = [
    ...html.matchAll(
      /<(?:li|div)\b[^>]*(?:eplister|eph-num|chbox|chapter-li)[^>]*>([\s\S]*?)<\/(?:li|div)>/gi,
    ),
  ];
  const blocks = madaraItems.length > 0 ? madaraItems : themesiaItems;

  const pushChapter = (href: string, name: string) => {
    const url = absUrl(origin, href);
    if (!url) return;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    if (!hostsCompatible(parsed.hostname, siteHost(baseUrl))) return;
    if (!looksLikeChapterPath(parsed.pathname) && blocks.length === 0) return;
    const payload = pathOf(parsed.toString(), baseUrl);
    if (seen.has(payload)) return;
    seen.add(payload);
    const label = name || payload.split("/").filter(Boolean).at(-1) || "Chapter";
    chapters.push({
      id: encodeChapterId(sourceKey, payload),
      name: label,
      chapterNumber: parseChapterNumber(label),
      volume: null,
      title: null,
      scanlationGroup: null,
      publishedAt: null,
      pageCount: 0,
    });
  };

  if (blocks.length > 0) {
    for (const block of blocks) {
      const href = block[1].match(/href=["']([^"']+)["']/i)?.[1];
      const name = stripTags(
        block[1].match(/<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? "",
      );
      if (href) pushChapter(href, name);
    }
  } else {
    for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const name = stripTags(match[2]);
      if (!name || name.length > 80) continue;
      pushChapter(match[1], name);
    }
  }

  const numbered = chapters.filter((chapter) => chapter.chapterNumber >= 0);
  if (numbered.length >= Math.max(3, chapters.length * 0.5)) {
    numbered.sort((a, b) => a.chapterNumber - b.chapterNumber);
    return numbered;
  }
  return chapters.reverse();
}

async function fetchMadaraChapters(
  mangaUrl: string,
  html: string,
  baseUrl: string,
  sourceKey: string,
  sourceName: string,
): Promise<ReaderChapter[]> {
  const existing = parseChaptersFromHtml(html, baseUrl, sourceKey);
  if (existing.length > 0) return existing;

  const origin = siteOrigin(baseUrl);
  const mangaId = attr(
    html.match(/<[^>]*id="manga-chapters-holder"[^>]*>/i)?.[0] ?? "",
    "data-id",
  );
  const cleanUrl = withTrailingSlash(mangaUrl.replace(/\?.*$/, ""));

  const attempts: Array<() => Promise<string>> = [
    async () => {
      const res = await sourcePost(`${cleanUrl}ajax/chapters/`, "", {
        referer: cleanUrl,
        accept: "text/html,*/*",
      });
      if (!res.ok) throw new Error(String(res.status));
      return res.text();
    },
    async () => {
      const res = await sourcePost(`${cleanUrl}ajax/chapters`, "", {
        referer: cleanUrl,
        accept: "text/html,*/*",
      });
      if (!res.ok) throw new Error(String(res.status));
      return res.text();
    },
    async () => {
      if (!mangaId) throw new Error("no manga id");
      const res = await sourcePost(
        `${origin}/wp-admin/admin-ajax.php`,
        new URLSearchParams({ action: "manga_get_chapters", manga: mangaId }),
        { referer: cleanUrl, accept: "text/html,*/*" },
      );
      if (!res.ok) throw new Error(String(res.status));
      return res.text();
    },
  ];

  for (const attempt of attempts) {
    try {
      const chapterHtml = await attempt();
      assertNotBlocked(chapterHtml, sourceName);
      const chapters = parseChaptersFromHtml(chapterHtml, baseUrl, sourceKey);
      if (chapters.length > 0) return chapters;
    } catch {
      /* try next */
    }
  }
  return [];
}

function pagesFromHtml(html: string, baseUrl: string): string[] {
  const origin = siteOrigin(baseUrl);
  const urls: string[] = [];

  const tsReader = html.match(/ts_reader\.run\((\{[\s\S]*?\})\);/);
  if (tsReader) {
    const images = [
      ...tsReader[1].matchAll(/"(https?:\\\/\\\/[^"]+)"/g),
    ].map((match) => match[1].replace(/\\+/g, ""));
    urls.push(...images.filter((url) => /\.(jpe?g|png|webp|avif|gif)(\?|$)/i.test(url) || /\/wp-content\/|\/uploads\//i.test(url)));
  }

  const preloaded = html.match(
    /chapter_preloaded_images\s*=\s*(\[[\s\S]*?\]);/,
  );
  if (preloaded) {
    urls.push(
      ...[...preloaded[1].matchAll(/"(https?:[^"]+)"/g)].map((match) =>
        match[1].replace(/\\+/g, ""),
      ),
    );
  }

  const reading = html.match(
    /<(?:div|ul)[^>]*(?:reading-content|readerarea|page-break|blocks-gallery)[^>]*>([\s\S]*?)<\/(?:div|ul)>/i,
  )?.[1] ?? html;
  for (const match of reading.matchAll(/<img\b[^>]*>/gi)) {
    const url = imageFromTag(match[0], origin);
    if (url) urls.push(url);
  }

  return uniqueUrls(
    urls.filter((url) => !/avatar|logo|icon|pixel|ads?|banner/i.test(url)),
  );
}

export function createSiteEngine(source: SiteSourceConfig): ReaderSourceEngine {
  const origin = siteOrigin(source.baseUrl);
  const host = siteHost(source.baseUrl);
  const isAdult = source.isAdultSource ?? false;

  async function listing(
    query: SourceBrowseQuery,
  ): Promise<SourceBrowsePage> {
    const parser = await detectParser(source.baseUrl, source.name);
    const page = Math.max(query.page, 1);
    if (parser === "mangabox") {
      const working = await mangaboxOrigin(source.baseUrl, source.name);
      const { html, filterQuery } = await mangaboxListingHtml(
        working,
        source.name,
        query.query ?? "",
        page,
        query.sort,
      );
      let items = parseMangaBoxListing(html, working, source.name, isAdult);
      if (filterQuery) {
        const needle = filterQuery.toLowerCase();
        items = items.filter(
          (item) =>
            item.title.toLowerCase().includes(needle) ||
            titlesMatch(item.title, filterQuery),
        );
      }
      return {
        items,
        page,
        hasMore:
          !filterQuery &&
          (items.length >= PAGE_SIZE ||
            /rel=["']next["']|group-page|page=\d+/i.test(html)),
      };
    }
    if (parser === "keyoapp") {
      const html = await keyoappListingHtml(
        source.baseUrl,
        source.name,
        query,
        (url) => pageHtml(url, source.baseUrl, source.name),
      );
      const items = parseKeyoappListing(
        html,
        source.baseUrl,
        source.name,
        isAdult,
      );
      return {
        items,
        page,
        hasMore:
          items.length >= PAGE_SIZE || /rel=["']next["']|page=\d+/i.test(html),
      };
    }
    const html =
      parser === "madara"
        ? await madaraSearchHtml(
            source.baseUrl,
            source.name,
            query.query ?? "",
            page,
            query.sort,
          )
        : parser === "mangathemesia"
          ? await themesiaSearchHtml(
              source.baseUrl,
              source.name,
              query.query ?? "",
              page,
              query.sort,
            )
          : await genericSearchHtml(
              source.baseUrl,
              source.name,
              query.query ?? "",
              page,
            );
    const items = parseListing(html, source.baseUrl, source.name, isAdult);
    return {
      items,
      page,
      hasMore: items.length >= PAGE_SIZE || /rel=["']next["']|nextpostslink|page\/\d+/i.test(html),
    };
  }

  async function fetchCandidate(id: string): Promise<CatalogCandidate> {
    const parser = await detectParser(source.baseUrl, source.name);
    const working =
      parser === "mangabox"
        ? await mangaboxOrigin(source.baseUrl, source.name)
        : source.baseUrl;
    const url = urlFromId(id, working);
    const html = await pageHtml(url, working, source.name);
    if (parser === "keyoapp") {
      return parseKeyoappDetails(html, url, working, source.name, isAdult);
    }
    return parseDetails(html, url, working, source.name, isAdult);
  }

  return {
    key: source.key,
    name: source.name,
    aliases: [source.name],
    hosts: [host],
    imageHosts: [host, "*"],
    imageReferer: isMangaBoxHost(host)
      ? /mangakakalot|mangabat/i.test(host)
        ? withTrailingSlash(origin)
        : "https://www.manganato.gg/"
      : withTrailingSlash(origin),

    async search(query) {
      const fromUrl = seriesIdFromUrl(query, source.baseUrl);
      if (fromUrl) return [await fetchCandidate(fromUrl)];
      const page = await listing({
        sort: "popular",
        query: query.trim(),
        page: 1,
        limit: PAGE_SIZE,
        hideAdult: false,
      });
      return page.items;
    },

    browse: listing,
    getById: fetchCandidate,

    async resolveManga(book): Promise<ResolvedManga> {
      const fromUrl = book.sourceUrl
        ? seriesIdFromUrl(book.sourceUrl, source.baseUrl)
        : null;
      let seriesUrl = fromUrl ? urlFromId(fromUrl, source.baseUrl) : null;
      let title = book.title;

      if (!seriesUrl) {
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
          throw new Error(
            `No ${source.name} listing was found for “${book.title}”.`,
          );
        }
        seriesUrl = match.url;
        title = match.title;
      }

      const parser = await detectParser(source.baseUrl, source.name);
      const working =
        parser === "mangabox"
          ? await mangaboxOrigin(source.baseUrl, source.name)
          : source.baseUrl;
      if (parser === "mangabox" && seriesUrl) {
        try {
          const parsed = new URL(seriesUrl);
          parsed.host = new URL(working).host;
          parsed.protocol = new URL(working).protocol;
          seriesUrl = parsed.toString();
        } catch {
          seriesUrl = urlFromId(pathOf(seriesUrl, working), working);
        }
      }
      const html = await pageHtml(seriesUrl, working, source.name);
      const chapters =
        parser === "mangabox"
          ? await fetchMangaBoxChapters(
              seriesUrl,
              originOf(working),
              source.key,
              source.name,
            )
          : parser === "madara"
            ? await fetchMadaraChapters(
                seriesUrl,
                html,
                source.baseUrl,
                source.key,
                source.name,
              )
            : parser === "keyoapp"
              ? parseKeyoappChapters(html, source.baseUrl, source.key)
              : parseChaptersFromHtml(html, source.baseUrl, source.key);

      if (chapters.length === 0) {
        throw new Error(`${source.name}: no readable chapters`);
      }

      return {
        manga: {
          id: pathOf(seriesUrl, source.baseUrl),
          title,
          originalLanguage: null,
          contentRating: isAdult ? "pornographic" : null,
        },
        chapters,
        sourceKey: source.key,
        sourceName: source.name,
        sourceUrl: seriesUrl,
      };
    },

    async getPageList(payload) {
      const parser = await detectParser(source.baseUrl, source.name);
      const working =
        parser === "mangabox"
          ? await mangaboxOrigin(source.baseUrl, source.name)
          : source.baseUrl;
      const url = urlFromId(payload, working);
      if (parser === "keyoapp") {
        const html = await pageHtml(url, working, source.name, false);
        const urls = pagesFromKeyoapp(html, working);
        if (urls.length === 0) {
          throw new Error("Chapter pages are unavailable");
        }
        return urls.map((imageUrl, index) => ({ index, url: imageUrl }));
      }
      if (parser === "mangabox") {
        const html = await pageHtml(url, working, source.name, false);
        const urls = pagesFromMangaBox(html, working);
        if (urls.length === 0) {
          throw new Error("Chapter pages are unavailable");
        }
        return urls.map((imageUrl, index) => ({ index, url: imageUrl }));
      }
      const listed = `${url}${url.includes("?") ? "&" : "?"}style=list`;
      let html: string;
      try {
        html = await pageHtml(listed, source.baseUrl, source.name, false);
      } catch {
        html = await pageHtml(url, source.baseUrl, source.name, false);
      }
      const urls = pagesFromHtml(html, source.baseUrl);
      if (urls.length === 0) {
        throw new Error("Chapter pages are unavailable");
      }
      return urls.map((imageUrl, index) => ({ index, url: imageUrl }));
    },
  };
}

export async function probeSiteParser(
  baseUrl: string,
  sourceName: string,
): Promise<SiteParser> {
  return detectParser(baseUrl, sourceName);
}

export function isSiteEngineKey(key: string): boolean {
  return (
    key !== "mangadex" &&
    key !== "asurascans" &&
    key !== "weebcentral" &&
    key !== "comick"
  );
}
