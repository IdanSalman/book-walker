/**
 * MangaBox / Manganato family (manganato.gg, natomanga, nelomanga, …).
 * Listing cards wrap each cover in its own `a[data-id]`; a lookbehind parser
 * steals the previous card's image. Chapters and page images live behind
 * hotlink-protected CDNs and a JSON chapter API.
 */

import {
  absUrl,
  assertNotBlocked,
  decodeHtml,
  hostOf,
  imageFromTag,
  isMangaBoxHost,
  looksLikeSeriesPath,
  originOf,
  pathOf,
  stripTags,
  withTrailingSlash,
} from "@/lib/reader/html";
import {
  parseChapterNumber,
  sourceJson,
  sourceText,
  uniqueUrls,
} from "@/lib/reader/source-fetch";
import { encodeChapterId } from "@/lib/reader/source-id";
import type { CatalogCandidate, ReaderChapter } from "@/lib/reader/types";

const MANGABOX_MIRRORS = [
  "https://www.manganato.gg",
  "https://www.natomanga.com",
  "https://www.nelomanga.com",
  "https://www.nelomanga.net",
];

const originCache = new Map<string, Promise<string>>();

type MangaBoxChapterApi = {
  success?: boolean;
  data?: {
    chapters?: Array<{
      chapter_name?: string;
      chapter_slug?: string;
      chapter_num?: number | string;
      updated_at?: string;
    }>;
  };
};

function fetchHtml(
  url: string,
  origin: string,
  sourceName: string,
  revalidate: number | false = 300,
): Promise<string> {
  return sourceText(url, {
    referer: withTrailingSlash(origin),
    revalidate,
  }).then((html) => {
    assertNotBlocked(html, sourceName);
    return html;
  });
}

export function mangaboxHostsCompatible(
  urlHost: string,
  sourceHost: string,
): boolean {
  const a = urlHost.replace(/^www\./, "").toLowerCase();
  const b = sourceHost.replace(/^www\./, "").toLowerCase();
  if (a === b) return true;
  return isMangaBoxHost(a) && isMangaBoxHost(b);
}

export async function mangaboxOrigin(
  baseUrl: string,
  sourceName: string,
): Promise<string> {
  const preferred = originOf(baseUrl);
  const cached = originCache.get(preferred);
  if (cached) return cached;

  const pending = (async () => {
    const candidates = [
      preferred,
      ...MANGABOX_MIRRORS.filter((mirror) => originOf(mirror) !== preferred),
    ];
    for (const candidate of candidates) {
      const origin = originOf(candidate);
      try {
        const html = await fetchHtml(
          `${origin}/manga-list/hot-manga?page=1`,
          origin,
          sourceName,
          1800,
        );
        if (
          html.length > 4000 &&
          /list-(?:comic|truyen)-item-wrap/i.test(html)
        ) {
          return origin;
        }
      } catch {
        /* try the next mirror */
      }
    }
    return preferred;
  })();

  originCache.set(preferred, pending);
  return pending;
}

function normalizeSearchQuery(query: string): string {
  return query
    .trim()
    .replace(/\s+/g, "_")
    .replace(/'/g, "_")
    .replace(/[^\w_-]/g, "");
}

export async function mangaboxListingHtml(
  origin: string,
  sourceName: string,
  query: string,
  page: number,
  sort: "popular" | "latest" | "updated" | "az" | string,
): Promise<{ html: string; filterQuery?: string }> {
  if (query.trim()) {
    const slug = normalizeSearchQuery(query);
    const searchUrl = `${origin}/search/story/${slug}?page=${page}`;
    try {
      return { html: await fetchHtml(searchUrl, origin, sourceName) };
    } catch {
      return {
        html: await fetchHtml(
          `${origin}/manga-list/hot-manga?page=${page}`,
          origin,
          sourceName,
        ),
        filterQuery: query.trim(),
      };
    }
  }
  const path =
    sort === "latest" || sort === "updated" ? "latest-manga" : "hot-manga";
  return {
    html: await fetchHtml(
      `${origin}/manga-list/${path}?page=${page}`,
      origin,
      sourceName,
    ),
  };
}

function extractCards(html: string): string[] {
  const starts = [
    ...html.matchAll(
      /<div\b[^>]*class="[^"]*(?:list-(?:comic|truyen)-item-wrap|story_item)[^"]*"[^>]*>/gi,
    ),
  ];

  const cards: string[] = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i].index ?? 0;
    const end =
      i + 1 < starts.length
        ? (starts[i + 1].index ?? start + 2800)
        : Math.min(html.length, start + 2800);
    const card = html.slice(start, end);
    if (/\b(?:hidden|banner-ai|js-banner)/i.test(starts[i][0])) continue;
    if (/\bhidden\b|js-banner-ai|banner-ai/i.test(card.slice(0, 200))) continue;
    if (
      /list-(?:comic|truyen)-item-wrap/i.test(starts[i][0]) &&
      !/data-id=/i.test(card)
    ) {
      continue;
    }
    if (!/\/manga\//i.test(card)) continue;
    cards.push(card);
  }
  return cards;
}

function titleFromCard(card: string): string | null {
  const heading = stripTags(
    card.match(/<h[1-6][^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? "",
  );
  if (heading) return heading;
  const titled = decodeHtml(
    card.match(/<a\b[^>]*data-id[^>]*title="([^"]+)"/i)?.[1] ??
      card.match(/<a\b[^>]*title="([^"]+)"[^>]*data-id/i)?.[1] ??
      "",
  ).trim();
  if (titled) return titled;
  const alt = decodeHtml(card.match(/<img\b[^>]*alt="([^"]+)"/i)?.[1] ?? "").trim();
  return alt || null;
}

function seriesUrlFromCard(card: string, origin: string): string | null {
  const hrefs = [...card.matchAll(/href=["']([^"']+)["']/gi)].map((match) =>
    absUrl(origin, match[1]),
  );
  for (const href of hrefs) {
    if (!href) continue;
    try {
      const parsed = new URL(href);
      if (!looksLikeSeriesPath(parsed.pathname)) continue;
      if (!mangaboxHostsCompatible(parsed.hostname, hostOf(origin))) continue;
      return parsed.toString();
    } catch {
      /* skip */
    }
  }
  return null;
}

export function parseMangaBoxListing(
  html: string,
  origin: string,
  sourceName: string,
  isAdult: boolean,
): CatalogCandidate[] {
  const seen = new Set<string>();
  const items: CatalogCandidate[] = [];

  for (const card of extractCards(html)) {
    const seriesUrl = seriesUrlFromCard(card, origin);
    if (!seriesUrl) continue;
    const id = pathOf(seriesUrl, origin);
    if (seen.has(id)) continue;
    const title = titleFromCard(card);
    if (!title || /read more|view all|next|prev/i.test(title)) continue;

    const cover =
      [...card.matchAll(/<img\b[^>]*>/gi)]
        .map((match) => imageFromTag(match[0], origin))
        .find((url) => url != null) ?? null;

    seen.add(id);
    items.push({
      id,
      title,
      summary: `Imported from ${sourceName}.`,
      coverUrl: cover,
      publicationStatus: "UNKNOWN",
      year: null,
      genres: [],
      isAdult,
      author: null,
      artist: null,
      lastChapter: null,
      url: withTrailingSlash(seriesUrl),
    });
  }

  return items;
}

function parseMangaBoxChaptersFromHtml(
  html: string,
  origin: string,
  sourceKey: string,
): ReaderChapter[] {
  const seen = new Set<string>();
  const chapters: ReaderChapter[] = [];
  const blocks = [
    ...html.matchAll(
      /<li\b[^>]*(?:a-h|row|chapter)[^>]*>([\s\S]*?)<\/li>/gi,
    ),
  ];

  for (const block of blocks) {
    const href = block[1].match(/href=["']([^"']+)["']/i)?.[1];
    const name = stripTags(
      block[1].match(/<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? "",
    );
    const url = absUrl(origin, href);
    if (!url || !name) continue;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] !== "manga" || parts.length < 3) continue;
    const payload = pathOf(parsed.toString(), origin);
    if (seen.has(payload)) continue;
    seen.add(payload);
    chapters.push({
      id: encodeChapterId(sourceKey, payload),
      name,
      chapterNumber: parseChapterNumber(name),
      volume: null,
      title: null,
      scanlationGroup: null,
      publishedAt: null,
      pageCount: 0,
    });
  }

  const numbered = chapters.filter((chapter) => chapter.chapterNumber >= 0);
  if (numbered.length >= Math.max(3, chapters.length * 0.5)) {
    numbered.sort((a, b) => a.chapterNumber - b.chapterNumber);
    return numbered;
  }
  return chapters.reverse();
}

export async function fetchMangaBoxChapters(
  seriesUrl: string,
  origin: string,
  sourceKey: string,
  sourceName: string,
): Promise<ReaderChapter[]> {
  const slug = pathOf(seriesUrl, origin).split("/").filter(Boolean).at(-1);
  if (slug) {
    try {
      const json = await sourceJson<MangaBoxChapterApi>(
        `${origin}/api/manga/${slug}/chapters?limit=-1`,
        {
          referer: withTrailingSlash(origin),
          accept: "application/json",
        },
      );
      const rows = json.data?.chapters ?? [];
      if (rows.length > 0) {
        return rows
          .slice()
          .reverse()
          .map((chapter) => {
            const name = chapter.chapter_name?.trim() || "Chapter";
            const chapterSlug = chapter.chapter_slug?.trim() || "";
            const payload = `/manga/${slug}/${chapterSlug}`.replace(/\/+$/, "");
            const num =
              typeof chapter.chapter_num === "number"
                ? chapter.chapter_num
                : parseChapterNumber(String(chapter.chapter_num ?? name));
            return {
              id: encodeChapterId(sourceKey, payload),
              name,
              chapterNumber: num,
              volume: null,
              title: null,
              scanlationGroup: null,
              publishedAt: chapter.updated_at ?? null,
              pageCount: 0,
            };
          });
      }
    } catch {
      /* fall through to HTML */
    }
  }

  const html = await fetchHtml(seriesUrl, origin, sourceName);
  return parseMangaBoxChaptersFromHtml(html, origin, sourceKey);
}

function jsStringArray(html: string, name: string): string[] {
  const match = html.match(
    new RegExp(`${name}\\s*=\\s*(\\[[\\s\\S]*?\\])`, "i"),
  );
  if (!match) return [];
  return [...match[1].matchAll(/"((?:\\.|[^"\\])*)"/g)].map((item) =>
    item[1].replace(/\\+/g, ""),
  );
}

export function pagesFromMangaBox(html: string, origin: string): string[] {
  const cdns = jsStringArray(html, "cdns");
  const images = jsStringArray(html, "chapterImages");
  const fromJs: string[] = [];
  if (images.length > 0) {
    const cdn = (cdns[0] ?? "").replace(/\/+$/, "");
    for (const image of images) {
      if (/^https?:\/\//i.test(image)) {
        fromJs.push(image);
        continue;
      }
      if (!cdn) continue;
      fromJs.push(`${cdn}/${image.replace(/^\/+/, "")}`);
    }
  }

  const reader =
    html.match(
      /<div[^>]*container-chapter-reader[^>]*>([\s\S]*?)<\/div>/i,
    )?.[1] ?? "";
  const fromHtml = [...reader.matchAll(/<img\b[^>]*>/gi)]
    .map((match) => imageFromTag(match[0], origin))
    .filter((url): url is string => url != null);

  return uniqueUrls(
    [...fromJs, ...fromHtml].filter(
      (url) => !/avatar|logo|icon|pixel|ads?|banner/i.test(url),
    ),
  );
}
