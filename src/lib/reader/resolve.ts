/**
 * Resolve a library title to a Mihon-compatible reading source.
 * Preferred source is the book's stored website; otherwise enabled
 * reading sources are tried in order (MangaDex, then the others).
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { coverRefererForHost } from "@/lib/cover-url";
import { isFreshReaderFetch } from "@/lib/reader/fetch-mode";
import { asuraEngine } from "@/lib/reader/engines/asura";
import { comickEngine, isComickSource } from "@/lib/reader/engines/comick";
import { mangaDexEngine } from "@/lib/reader/engines/mangadex";
import { openLibraryEngine } from "@/lib/reader/engines/openlibrary";
import { localPdfEngine } from "@/lib/reader/engines/localpdf";
import {
  createSiteEngine,
  isSiteEngineKey,
} from "@/lib/reader/engines/site";
import { weebCentralEngine } from "@/lib/reader/engines/weebcentral";
import { hostOf } from "@/lib/reader/html";
import {
  engineMatchesName,
  engineMatchesUrl,
  type ReaderBookRef,
  type ReaderSourceEngine,
} from "@/lib/reader/source-engine";
import { decodeChapterId } from "@/lib/reader/source-id";
import type { ReaderPage, ResolvedManga } from "@/lib/reader/types";
import { ensureBuiltInSources } from "@/lib/sources/ensure";

export const READING_ENGINES: ReaderSourceEngine[] = [
  mangaDexEngine,
  asuraEngine,
  weebCentralEngine,
  comickEngine,
];

/** Page-image book scans and uploaded PDFs. Kept out of READING_ENGINES so manga import/cover repair stay comic-only. */
export const BOOK_READING_ENGINES: ReaderSourceEngine[] = [
  openLibraryEngine,
  localPdfEngine,
];

const ALL_READING_ENGINES: ReaderSourceEngine[] = [
  ...READING_ENGINES,
  ...BOOK_READING_ENGINES,
];

const COMMON_IMAGE_HOSTS = [
  "archive.org",
  "wp.com",
  "wordpress.com",
  "googleusercontent.com",
  "ggpht.com",
  "blogspot.com",
  "blogger.com",
  "imgur.com",
  "imgbb.com",
  "ibb.co",
  "catbox.moe",
  "b-cdn.net",
  "cloudfront.net",
  "cloudinary.com",
  "imagekit.io",
  "bunny.net",
  "statically.io",
  "wsrv.nl",
  "meowing.org",
  "meo.comick.pictures",
  "comick.pictures",
  "comicknew.pictures",
  "2xstorage.com",
  "waitst.com",
  "mkklcdnv6temp.com",
  "mkklcdnv6temp.xyz",
  "toonily.com",
  "tnlycdn.com",
];

const ACTIVE_SOURCE_WHERE: Prisma.FetchSourceWhereInput = {
  enabled: true,
  OR: [{ supportsReading: true }, { supportsSearch: true }],
};

export function readingEngine(key: string): ReaderSourceEngine | undefined {
  return ALL_READING_ENGINES.find((engine) => engine.key === key);
}

export function isReadingEngine(key: string): boolean {
  return readingEngine(key) != null;
}

export async function sourceEngine(
  key: string,
): Promise<ReaderSourceEngine | undefined> {
  const builtin = readingEngine(key);
  if (builtin) return builtin;

  if (key === "toonily") await ensureBuiltInSources();

  const row = await prisma.fetchSource.findUnique({
    where: { key },
    select: {
      key: true,
      name: true,
      baseUrl: true,
      enabled: true,
      supportsSearch: true,
      supportsReading: true,
      isAdultSource: true,
      kind: true,
    },
  });
  if (!row?.enabled) return undefined;
  if (row.kind === "METADATA") return undefined;
  if (!row.supportsSearch && !row.supportsReading) return undefined;
  if (isComickSource(row)) return comickEngine;
  if (row.kind !== "SCRAPER" || !isSiteEngineKey(row.key)) return undefined;

  return createSiteEngine(row);
}

async function enabledReadingEngines(): Promise<ReaderSourceEngine[]> {
  await ensureBuiltInSources();
  const rows = await prisma.fetchSource.findMany({
    where: ACTIVE_SOURCE_WHERE,
    orderBy: [{ priority: "desc" }, { name: "asc" }],
    select: {
      key: true,
      name: true,
      baseUrl: true,
      supportsSearch: true,
      supportsReading: true,
      isAdultSource: true,
      kind: true,
    },
  });

  if (rows.length === 0) return READING_ENGINES;

  const engines: ReaderSourceEngine[] = [];
  for (const row of rows) {
    const builtin = readingEngine(row.key);
    if (builtin) {
      if (BOOK_READING_ENGINES.some((engine) => engine.key === builtin.key)) {
        continue;
      }
      engines.push(builtin);
      continue;
    }
    if (isComickSource(row)) {
      if (!engines.some((engine) => engine.key === comickEngine.key)) {
        engines.push(comickEngine);
      }
      continue;
    }
    if (row.kind !== "SCRAPER" || !isSiteEngineKey(row.key)) continue;
    engines.push(createSiteEngine(row));
  }

  return engines.length > 0 ? engines : READING_ENGINES;
}

function orderedEngines(
  engines: ReaderSourceEngine[],
  book: ReaderBookRef,
): ReaderSourceEngine[] {
  const named: ReaderSourceEngine[] = [];
  const byUrl: ReaderSourceEngine[] = [];
  const rest: ReaderSourceEngine[] = [];
  for (const engine of engines) {
    if (engineMatchesName(engine, book.sourceName)) named.push(engine);
    else if (engineMatchesUrl(engine, book.sourceUrl)) byUrl.push(engine);
    else rest.push(engine);
  }
  return [...named, ...byUrl, ...rest];
}

/** The engine that matches this listing’s stored source, if any. */
export async function currentReadingEngine(
  book: ReaderBookRef,
): Promise<ReaderSourceEngine | undefined> {
  if (book.category === "BOOK") {
    return (
      BOOK_READING_ENGINES.find(
        (engine) =>
          engineMatchesName(engine, book.sourceName) ||
          engineMatchesUrl(engine, book.sourceUrl),
      ) ?? openLibraryEngine
    );
  }

  const engines = await enabledReadingEngines();
  return engines.find(
    (engine) =>
      engineMatchesName(engine, book.sourceName) ||
      engineMatchesUrl(engine, book.sourceUrl),
  );
}

const RESOLVE_TTL_MS = 2 * 60 * 1000;
const mangaResolveCache = new Map<
  string,
  { expires: number; promise: Promise<ResolvedManga> }
>();

function mangaResolveCacheKey(book: ReaderBookRef): string {
  return `${book.id}:${book.sourceUrl ?? ""}:${book.sourceName ?? ""}`;
}

export function invalidateMangaResolveCache(bookId?: string) {
  if (!bookId) {
    mangaResolveCache.clear();
    return;
  }
  const prefix = `${bookId}:`;
  for (const key of mangaResolveCache.keys()) {
    if (key.startsWith(prefix)) mangaResolveCache.delete(key);
  }
}

async function resolveMangaFromEngines(
  book: ReaderBookRef,
): Promise<ResolvedManga> {
  if (book.category === "BOOK") {
    const engine = await currentReadingEngine(book);
    return (engine ?? openLibraryEngine).resolveManga(book);
  }

  const engines = orderedEngines(await enabledReadingEngines(), book);
  const errors: string[] = [];

  for (const engine of engines) {
    try {
      const resolved = await engine.resolveManga(book);
      if (resolved.chapters.length > 0) return resolved;
      errors.push(`${engine.name}: no readable chapters`);
    } catch (error) {
      errors.push(
        `${engine.name}: ${error instanceof Error ? error.message : "failed"}`,
      );
    }
  }

  throw new Error(
    errors.length > 0
      ? errors.join(" ")
      : "No readable chapters were found on the enabled Mihon sources.",
  );
}

export async function getMangaWithChapters(
  book: ReaderBookRef,
): Promise<ResolvedManga> {
  const key = mangaResolveCacheKey(book);
  if (isFreshReaderFetch()) {
    invalidateMangaResolveCache(book.id);
  } else {
    const hit = mangaResolveCache.get(key);
    if (hit && hit.expires > Date.now()) return hit.promise;
  }

  const promise = resolveMangaFromEngines(book).catch((error) => {
    mangaResolveCache.delete(key);
    throw error;
  });
  mangaResolveCache.set(key, {
    expires: Date.now() + RESOLVE_TTL_MS,
    promise,
  });
  return promise;
}

export async function getChapterPages(
  chapterId: string,
  dataSaver = false,
): Promise<ReaderPage[]> {
  const ref = decodeChapterId(chapterId);
  if (!ref) throw new Error("Invalid chapter");
  const engine = await sourceEngine(ref.sourceKey);
  if (!engine) throw new Error("Unknown source");
  return engine.getPageList(ref.payload, dataSaver);
}

export async function refererForSourceKey(
  sourceKey: string,
): Promise<string | undefined> {
  const engine = await sourceEngine(sourceKey);
  return engine?.imageReferer;
}

function hostAllowed(
  hostname: string,
  suffixes: string[],
): boolean {
  const host = hostname.toLowerCase();
  return suffixes.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

export async function isAllowedReaderImageHost(
  hostname: string,
  refererHostname?: string,
): Promise<boolean> {
  const host = hostname.toLowerCase();
  if (
    ALL_READING_ENGINES.some((engine) =>
      hostAllowed(
        host,
        engine.imageHosts.filter((item) => item !== "*"),
      ),
    )
  ) {
    return true;
  }
  if (hostAllowed(host, COMMON_IMAGE_HOSTS)) return true;

  const sources = await prisma.fetchSource.findMany({
    where: ACTIVE_SOURCE_WHERE,
    select: { key: true, baseUrl: true },
  });
  if (
    sources.some((source) => {
      try {
        return hostAllowed(host, [hostOf(source.baseUrl)]);
      } catch {
        return false;
      }
    })
  ) {
    return true;
  }

  if (!refererHostname) return false;
  const referer = refererHostname.toLowerCase();
  if (hostAllowed(host, [referer])) return true;
  return sources.some((source) => {
    if (!isSiteEngineKey(source.key)) return false;
    try {
      return hostAllowed(referer, [hostOf(source.baseUrl)]);
    } catch {
      return false;
    }
  });
}

export async function imageRefererForHost(
  hostname: string,
): Promise<string | undefined> {
  const host = hostname.toLowerCase();
  const builtin = ALL_READING_ENGINES.find((engine) =>
    hostAllowed(
      host,
      engine.imageHosts.filter((item) => item !== "*"),
    ),
  );
  if (builtin?.imageReferer) return builtin.imageReferer;

  const sources = await prisma.fetchSource.findMany({
    where: ACTIVE_SOURCE_WHERE,
    select: { key: true, baseUrl: true },
  });
  const matched = sources.find((source) => {
    try {
      return hostAllowed(host, [hostOf(source.baseUrl)]);
    } catch {
      return false;
    }
  });
  if (matched) {
    try {
      return `${new URL(matched.baseUrl).origin}/`;
    } catch {
      return matched.baseUrl;
    }
  }

  const mapped = coverRefererForHost(host);
  if (mapped) return mapped;

  const site = sources.find((source) => isSiteEngineKey(source.key));
  if (!site) return undefined;
  try {
    return `${new URL(site.baseUrl).origin}/`;
  } catch {
    return site.baseUrl;
  }
}
