export function decodeHtml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

export function absUrl(baseUrl: string, href: string | null | undefined): string | null {
  if (!href) return null;
  const trimmed = decodeHtml(href.trim());
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("javascript:")) {
    return null;
  }
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return null;
  }
}

export function attr(tag: string, name: string): string | null {
  const match =
    tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i")) ??
    tag.match(new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, "i"));
  return match?.[1] ? decodeHtml(match[1]) : null;
}

const SKIP_IMAGE_RE =
  /placeholder|no[-_]?image|lazy\.gif|spinner|logo-|favicon|default_nato|iconify|\/icon[s]?\/|\.svg(\?|$)/i;

export function isJunkImageUrl(url: string): boolean {
  return SKIP_IMAGE_RE.test(url);
}

export function cssBackgroundUrl(
  html: string,
  baseUrl: string,
): string | null {
  const matches = [
    ...html.matchAll(
      /background-image\s*:\s*url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
    ),
    ...html.matchAll(/\bstyle=["'][^"']*url\(\s*(['"]?)([^'")]+)\1/gi),
  ];
  for (const match of matches) {
    const url = absUrl(baseUrl, match[2]?.trim());
    if (url && !isJunkImageUrl(url)) return keyoappThumbUrl(url);
  }
  return null;
}

/** Keyoapp (Mist Scans, etc.) returns dynamic thumbnails when `w` is set. */
export function keyoappThumbUrl(url: string, width = 480): string {
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname.replace(/^www\./, "") === "wsrv.nl" ||
      /meowing\.org|keyoapp\.com/i.test(parsed.hostname)
    ) {
      parsed.searchParams.set("w", String(width));
      return parsed.toString();
    }
  } catch {
    /* keep the original URL */
  }
  return url;
}

export function imageFromTag(tag: string, baseUrl: string): string | null {
  const candidates = [
    attr(tag, "data-src"),
    attr(tag, "data-lazy-src"),
    attr(tag, "data-cfsrc"),
    attr(tag, "data-original"),
    attr(tag, "data-bg"),
    srcsetBest(attr(tag, "data-srcset") ?? attr(tag, "srcset")),
    attr(tag, "src"),
  ];
  for (const candidate of candidates) {
    const url = absUrl(baseUrl, candidate);
    if (url && !isJunkImageUrl(url)) {
      return url;
    }
  }
  return cssBackgroundUrl(tag, baseUrl);
}

function srcsetBest(srcset: string | null): string | null {
  if (!srcset) return null;
  const parts = srcset
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean);
  return parts.at(-1) ?? null;
}

export function originOf(url: string): string {
  return new URL(url).origin;
}

export function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
}

export function withTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

export function pathOf(url: string, baseUrl: string): string {
  try {
    const parsed = new URL(url, baseUrl);
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    return path;
  } catch {
    return url;
  }
}

export function isCloudflareChallenge(html: string): boolean {
  return (
    /just a moment/i.test(html) && /cf-|cloudflare/i.test(html)
  ) || /cf-browser-verification|challenge-platform/i.test(html);
}

export function assertNotBlocked(html: string, sourceName: string): void {
  if (isCloudflareChallenge(html)) {
    throw new Error(
      `${sourceName} is behind Cloudflare and blocked the server request.`,
    );
  }
}

const SERIES_DIRS = new Set([
  "manga",
  "manhwa",
  "manhua",
  "series",
  "comic",
  "comics",
  "webtoon",
  "webtoons",
  "title",
]);

export function seriesPathParts(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

function mangaDirIndex(parts: string[]): number {
  return parts.findIndex((part) => SERIES_DIRS.has(part.toLowerCase()));
}

export function looksLikeSeriesPath(pathname: string): boolean {
  const parts = seriesPathParts(pathname);
  const dirIndex = mangaDirIndex(parts);
  if (dirIndex < 0) return false;
  return parts.length === dirIndex + 2;
}

export function looksLikeChapterPath(pathname: string): boolean {
  const parts = seriesPathParts(pathname);
  const dirIndex = mangaDirIndex(parts);
  if (dirIndex < 0) return false;
  return parts.length >= dirIndex + 3;
}

export function detectMangaDirectory(html: string, baseUrl: string): string {
  const counts = new Map<string, number>();
  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const url = absUrl(baseUrl, match[1]);
    if (!url) continue;
    try {
      const parts = seriesPathParts(new URL(url).pathname);
      const dir = parts[0]?.toLowerCase();
      if (dir && SERIES_DIRS.has(dir)) {
        counts.set(dir, (counts.get(dir) ?? 0) + 1);
      }
    } catch {
      /* ignore */
    }
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[0] ?? "manga";
}

export type SiteParser =
  | "madara"
  | "mangathemesia"
  | "mangabox"
  | "keyoapp"
  | "generic";

export function isMangaBoxHost(host: string): boolean {
  return /manganato|natomanga|nelomanga|mangakakalot|mangabat|chapmanganato/i.test(
    host,
  );
}

export function isKeyoappHost(host: string): boolean {
  return /mistscans\.com|keyoapp\.com|meowing\.org/i.test(host);
}

export function detectSiteParser(html: string, host?: string): SiteParser {
  if (host && isMangaBoxHost(host)) return "mangabox";
  if (host && isKeyoappHost(host)) return "keyoapp";
  if (
    /list-comic-item-wrap|list-truyen-item-wrap|manga-list\/hot-manga|2xstorage\.com|mkklcdn/i.test(
      html,
    )
  ) {
    return "mangabox";
  }
  if (
    /series-splide|searched_series_page|series_tags_page|pinned-splide|wsrv\.nl\/\?url=cdn\.meowing/i.test(
      html,
    )
  ) {
    return "keyoapp";
  }
  if (
    /wp-manga|madara|page-item-detail|c-tabs-item|manga-chapters-holder|manga_get_chapters/i.test(
      html,
    )
  ) {
    return "madara";
  }
  if (
    /ts_reader|themesia|listupd|serieslist|seriestucontent|#chapterlist|eplister/i.test(
      html,
    )
  ) {
    return "mangathemesia";
  }
  return "generic";
}

export function mapPublicationStatus(
  value: string | null | undefined,
): import("@prisma/client").PublicationStatus {
  const status = value?.toLowerCase() ?? "";
  if (/complete|finaliz|conclu/.test(status)) return "COMPLETED";
  if (/hiatus|on.?hold|pause/.test(status)) return "HIATUS";
  if (/cancel|drop/.test(status)) return "CANCELLED";
  if (/ongoing|publishing|release/.test(status)) return "ONGOING";
  return "UNKNOWN";
}
