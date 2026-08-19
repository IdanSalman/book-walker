/**
 * Keyoapp theme (Mist Scans and related scan sites), modeled on Mihon's
 * Keyoapp.kt / MistScans.kt: covers live in CSS background-image, popular
 * uses the homepage carousel, latest is /latest/, search is /series/?q=.
 */

import {
  absUrl,
  attr,
  cssBackgroundUrl,
  hostOf,
  imageFromTag,
  isKeyoappHost,
  looksLikeChapterPath,
  mapPublicationStatus,
  originOf,
  pathOf,
  stripTags,
  withTrailingSlash,
} from "@/lib/reader/html";
import {
  parseChapterNumber,
  uniqueUrls,
} from "@/lib/reader/source-fetch";
import { encodeChapterId } from "@/lib/reader/source-id";
import type { CatalogCandidate, ReaderChapter } from "@/lib/reader/types";
import type { SourceBrowseQuery } from "@/lib/sources/browse";

const CDN_HOST_RE = /realUrl\s*=\s*`[^`]+\/\/([^/`]+)/;
const CDN_CLEAN_RE = /\$\{[^}]*\}/g;

export function isKeyoappSource(baseUrl: string): boolean {
  try {
    return isKeyoappHost(hostOf(baseUrl));
  } catch {
    return false;
  }
}

export async function keyoappListingHtml(
  baseUrl: string,
  sourceName: string,
  query: SourceBrowseQuery,
  fetchHtml: (url: string) => Promise<string>,
): Promise<string> {
  const origin = originOf(baseUrl);
  const page = Math.max(query.page, 1);
  const q = query.query?.trim() ?? "";
  if (q) {
    const params = new URLSearchParams({ q });
    return fetchHtml(`${origin}/series/?${params}`);
  }
  if (query.sort === "latest" || query.sort === "updated") {
    return fetchHtml(
      page > 1 ? `${origin}/latest/?page=${page}` : `${origin}/latest/`,
    );
  }
  if (page > 1) {
    return fetchHtml(`${origin}/series/?page=${page}`);
  }
  return fetchHtml(withTrailingSlash(origin));
}

export function parseKeyoappListing(
  html: string,
  baseUrl: string,
  sourceName: string,
  isAdult: boolean,
): CatalogCandidate[] {
  const origin = originOf(baseUrl);
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
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0]?.toLowerCase() !== "series" || parts.length !== 2) continue;

    const id = pathOf(parsed.toString(), baseUrl);
    const start = match.index ?? 0;
    const innerEnd = html.slice(start, start + 2500).search(/<\/a>/i);
    const block = html.slice(
      start,
      start + (innerEnd >= 0 ? innerEnd + 4 : 1200),
    );
    const cover =
      cssBackgroundUrl(match[0] + block, origin) ??
      [...block.matchAll(/<img\b[^>]*>/gi)]
        .map((img) => imageFromTag(img[0], origin))
        .find((url) => url != null) ??
      null;

    if (seen.has(id)) {
      const existing = items.find((item) => item.id === id);
      if (existing && !existing.coverUrl && cover) existing.coverUrl = cover;
      continue;
    }

    const title =
      attr(match[0], "title") ||
      attr(match[0], "alt") ||
      stripTags(block.match(/<(?:h[1-6]|span|div)[^>]*>([\s\S]*?)<\//i)?.[1] ?? "");
    if (!title || /^(series|latest|home|view all)$/i.test(title)) continue;

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
      url: `${origin}${id}/`,
    });
  }

  return items;
}

export function parseKeyoappDetails(
  html: string,
  url: string,
  baseUrl: string,
  sourceName: string,
  isAdult: boolean,
): CatalogCandidate {
  const origin = originOf(baseUrl);
  const title =
    stripTags(html.match(/<div[^>]*class="[^"]*grid[^"]*"[^>]*>\s*<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "") ||
    stripTags(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "") ||
    attr(html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[0] ?? "", "content") ||
    "Untitled";
  const description =
    stripTags(
      html.match(/id="expand_content"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "",
    ) ||
    attr(
      html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)?.[0] ?? "",
      "content",
    ) ||
    `Imported from ${sourceName}.`;
  const cover =
    cssBackgroundUrl(
      html.match(/<[^>]*photoURL[^>]*>/i)?.[0] ?? "",
      origin,
    ) ||
    cssBackgroundUrl(html.slice(0, 12000), origin) ||
    absUrl(
      origin,
      html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1],
    );

  return {
    id: pathOf(url, baseUrl),
    title,
    summary: (description ?? "").slice(0, 4000),
    coverUrl: cover,
    publicationStatus: mapPublicationStatus(
      stripTags(
        html.match(
          /<div[^>]*>\s*<span[^>]*>\s*Status\s*<\/span>[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/i,
        )?.[1] ?? "",
      ),
    ),
    year: null,
    genres: [
      ...new Set(
        [
          ...html.matchAll(/href=["'][^"']*genre[^"']*["'][^>]*>([^<]+)</gi),
        ]
          .map((match) => stripTags(match[1]))
          .filter((genre) => genre.length > 1 && genre.length < 40),
      ),
    ].slice(0, 16),
    isAdult,
    author: null,
    artist: null,
    lastChapter: null,
    url: withTrailingSlash(url.startsWith("http") ? url : `${origin}${url}`),
  };
}

export function parseKeyoappChapters(
  html: string,
  baseUrl: string,
  sourceKey: string,
): ReaderChapter[] {
  const origin = originOf(baseUrl);
  const seen = new Set<string>();
  const chapters: ReaderChapter[] = [];

  const push = (href: string, body: string) => {
    if (/Upcoming/i.test(body)) return;
    if (/alt=["'][^"']*Coin/i.test(body)) return;
    const url = absUrl(origin, href);
    if (!url) return;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    if (!looksLikeChapterPath(parsed.pathname)) return;
    const payload = pathOf(url, baseUrl);
    if (seen.has(payload)) return;
    seen.add(payload);
    const name =
      stripTags(
        body.match(/class="[^"]*text-sm[^"]*"[^>]*>([\s\S]*?)</i)?.[1] ?? "",
      ) ||
      stripTags(body).slice(0, 80) ||
      payload.split("/").filter(Boolean).at(-1) ||
      "Chapter";
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
  };

  const section =
    html.match(/id="chapters"[\s\S]*?(?=<footer|id="pages"|<\/main>|$)/i)?.[0] ??
    html;
  for (const row of section.matchAll(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    push(row[1], row[2]);
  }

  return chapters.reverse();
}

export function pagesFromKeyoapp(html: string, baseUrl: string): string[] {
  const origin = originOf(baseUrl);
  const cdn = keyoappCdnUrl(html) ?? "https://cdn.meowing.org/uploads";
  const fromUid = [...html.matchAll(/<img\b[^>]*\buid=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1].trim())
    .filter(Boolean)
    .map((uid) => `${cdn}/${uid}`);
  if (fromUid.length > 0) return uniqueUrls(fromUid);

  const reading =
    html.match(/id="pages"[^>]*>([\s\S]*?)<\/(?:div|section)/i)?.[1] ?? "";
  const urls: string[] = [];
  for (const match of reading.matchAll(/<img\b[^>]*>/gi)) {
    const url = imageFromTag(match[0], origin);
    if (url) urls.push(url);
  }
  return uniqueUrls(urls);
}

function keyoappCdnUrl(html: string): string | null {
  const host = html.match(CDN_HOST_RE)?.[1]?.replace(CDN_CLEAN_RE, "");
  if (!host) return null;
  return `https://${host}/uploads`;
}
