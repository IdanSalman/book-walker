/**
 * Public-domain / freely readable book scans from Open Library + Internet Archive.
 * Pages are JPEG images, same shape as manga chapter pages.
 */

import { sourceJson } from "@/lib/reader/source-fetch";
import { encodeChapterId, titlesMatch } from "@/lib/reader/source-id";
import type { ReaderBookRef } from "@/lib/reader/source-engine";
import type {
  CatalogCandidate,
  ReaderPage,
  ResolvedManga,
} from "@/lib/reader/types";

export const OPEN_LIBRARY_KEY = "openlibrary";
export const OPEN_LIBRARY_NAME = "Open Library";
export const IA_DETAILS = "https://archive.org/details";
export const IA_METADATA = "https://archive.org/metadata";
export const OL_SEARCH = "https://openlibrary.org/search.json";
export const PAGE_WIDTH_FULL = 1600;
export const PAGE_WIDTH_SAVER = 800;
export const MIN_SCAN_PAGES = 5;
export const MAX_SCAN_PAGES = 2500;
export const MAX_IA_CANDIDATES = 8;

const SKIP_IA_ID =
  /librivox|synapseml|gutenberg|_gut$|gut$|podcast|audiobook|audio_/i;

type OpenLibraryDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  ia?: string[];
  ebook_access?: string;
  public_scan_b?: boolean;
  cover_i?: number;
  number_of_pages_median?: number;
};

type OpenLibrarySearch = {
  docs?: OpenLibraryDoc[];
};

type InternetArchiveMetadata = {
  metadata?: {
    mediatype?: string;
    imagecount?: string | number;
    "access-restricted-item"?: string | boolean;
    title?: string;
  };
};

export type PublicScan = {
  iaId: string;
  pageCount: number;
  title: string;
  workKey: string | null;
  coverUrl: string | null;
};

export function iaIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!/(^|\.)archive\.org$/i.test(parsed.hostname)) return null;
    const match = parsed.pathname.match(
      /^\/(?:details|download|stream)\/([^/]+)/i,
    );
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export function openLibraryWorkKey(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const match = value.match(/OL\d+W/i);
  return match ? match[0].toUpperCase() : null;
}

export function shouldSkipIaIdentifier(id: string): boolean {
  return SKIP_IA_ID.test(id);
}

export function isPublicEbook(doc: {
  ebook_access?: string;
  public_scan_b?: boolean;
}): boolean {
  return doc.ebook_access === "public" || doc.public_scan_b === true;
}

export function encodeScanPayload(iaId: string, pageCount: number): string {
  return `${iaId}:${pageCount}`;
}

export function decodeScanPayload(
  payload: string,
): { iaId: string; pageCount: number | null } | null {
  const idx = payload.lastIndexOf(":");
  if (idx <= 0) {
    return payload ? { iaId: payload, pageCount: null } : null;
  }
  const iaId = payload.slice(0, idx);
  const count = Number.parseInt(payload.slice(idx + 1), 10);
  if (!iaId) return null;
  if (!Number.isFinite(count) || count < 1) {
    return { iaId, pageCount: null };
  }
  return { iaId, pageCount: count };
}

export function pageImageUrl(
  iaId: string,
  index: number,
  dataSaver = false,
): string {
  const width = dataSaver ? PAGE_WIDTH_SAVER : PAGE_WIDTH_FULL;
  return `https://archive.org/download/${encodeURIComponent(iaId)}/page/n${index}_w${width}.jpg`;
}

export function pagesForScan(
  iaId: string,
  pageCount: number,
  dataSaver = false,
): ReaderPage[] {
  const count = Math.min(MAX_SCAN_PAGES, Math.max(0, pageCount));
  const pages: ReaderPage[] = [];
  for (let index = 0; index < count; index += 1) {
    pages.push({
      index,
      url: pageImageUrl(iaId, index, dataSaver),
      referer: "https://archive.org/",
    });
  }
  return pages;
}

export function scanIsReadable(meta: InternetArchiveMetadata): number | null {
  const data = meta.metadata;
  if (!data) return null;
  if (data.mediatype && data.mediatype !== "texts") return null;
  const restricted = data["access-restricted-item"];
  if (restricted === true || restricted === "true") return null;
  const count = Number.parseInt(String(data.imagecount ?? ""), 10);
  if (!Number.isFinite(count) || count < MIN_SCAN_PAGES) return null;
  return Math.min(count, MAX_SCAN_PAGES);
}

function coverFromDoc(doc: { cover_i?: number }): string | null {
  if (!doc.cover_i) return null;
  return `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
}

function workKeyFromDoc(doc: OpenLibraryDoc): string | null {
  return openLibraryWorkKey(doc.key ?? null);
}

async function iaMetadata(iaId: string): Promise<InternetArchiveMetadata> {
  return sourceJson<InternetArchiveMetadata>(
    `${IA_METADATA}/${encodeURIComponent(iaId)}`,
    { revalidate: 3600, accept: "application/json" },
  );
}

export async function resolveIaScan(iaId: string): Promise<PublicScan | null> {
  if (shouldSkipIaIdentifier(iaId)) return null;
  try {
    const meta = await iaMetadata(iaId);
    const pageCount = scanIsReadable(meta);
    if (pageCount == null) return null;
    return {
      iaId,
      pageCount,
      title: meta.metadata?.title?.trim() || iaId,
      workKey: null,
      coverUrl: `https://archive.org/services/img/${encodeURIComponent(iaId)}`,
    };
  } catch {
    return null;
  }
}

async function firstReadableScan(
  identifiers: string[],
): Promise<PublicScan | null> {
  const unique = [...new Set(identifiers.filter((id) => !shouldSkipIaIdentifier(id)))];
  for (const iaId of unique.slice(0, MAX_IA_CANDIDATES)) {
    const scan = await resolveIaScan(iaId);
    if (scan) return scan;
  }
  return null;
}

async function searchOpenLibrary(params: URLSearchParams) {
  return sourceJson<OpenLibrarySearch>(`${OL_SEARCH}?${params}`, {
    revalidate: 3600,
    accept: "application/json",
  });
}

const SEARCH_FIELDS =
  "key,title,author_name,ia,ebook_access,public_scan_b,cover_i,number_of_pages_median";

function searchParams(extra: Record<string, string>) {
  const params = new URLSearchParams({
    limit: "8",
    fields: SEARCH_FIELDS,
    ...extra,
  });
  return params;
}

function pickMatchingDocs(docs: OpenLibraryDoc[], title: string) {
  const publicDocs = docs.filter(
    (doc) => isPublicEbook(doc) && (doc.ia?.length ?? 0) > 0,
  );
  const exact = publicDocs.filter((doc) =>
    titlesMatch(doc.title ?? "", title),
  );
  if (exact.length > 0) return exact;
  const needle = title.trim().toLowerCase();
  return publicDocs.filter((doc) => {
    const candidate = doc.title?.trim().toLowerCase() ?? "";
    return (
      candidate.length > 0 &&
      (candidate.includes(needle) || needle.includes(candidate))
    );
  });
}

async function scanFromDocs(
  docs: OpenLibraryDoc[],
  title: string,
): Promise<PublicScan | null> {
  for (const doc of pickMatchingDocs(docs, title)) {
    const scan = await firstReadableScan(doc.ia ?? []);
    if (!scan) continue;
    return {
      ...scan,
      title: doc.title?.trim() || scan.title,
      workKey: workKeyFromDoc(doc),
      coverUrl: coverFromDoc(doc) ?? scan.coverUrl,
    };
  }
  return null;
}

export async function findPublicScan(
  book: ReaderBookRef,
): Promise<PublicScan> {
  const fromUrl = iaIdFromUrl(book.sourceUrl);
  if (fromUrl) {
    const scan = await resolveIaScan(fromUrl);
    if (scan) return scan;
  }

  const iaExternal = book.externalId?.startsWith("ia:")
    ? book.externalId.slice(3)
    : null;
  if (iaExternal) {
    const scan = await resolveIaScan(iaExternal);
    if (scan) return scan;
  }

  const workKey = openLibraryWorkKey(book.externalId) ??
    openLibraryWorkKey(book.sourceUrl);
  if (workKey) {
    const json = await searchOpenLibrary(
      searchParams({ q: `key:/works/${workKey}` }),
    );
    const scan = await scanFromDocs(json.docs ?? [], book.title);
    if (scan) return scan;
  }

  const titleParams = searchParams({ title: book.title });
  if (book.author) titleParams.set("author", book.author);
  const byTitle = await searchOpenLibrary(titleParams);
  const fromTitle = await scanFromDocs(byTitle.docs ?? [], book.title);
  if (fromTitle) return fromTitle;

  throw new Error(
    "No public page scan was found on Open Library / Internet Archive for this title.",
  );
}

function resolvedFromScan(book: ReaderBookRef, scan: PublicScan): ResolvedManga {
  return {
    manga: {
      id: scan.iaId,
      title: book.title,
      originalLanguage: "en",
      contentRating: "safe",
    },
    chapters: [
      {
        id: encodeChapterId(
          OPEN_LIBRARY_KEY,
          encodeScanPayload(scan.iaId, scan.pageCount),
        ),
        name: "Internet Archive scan",
        chapterNumber: 1,
        volume: null,
        title: `${scan.pageCount.toLocaleString()} pages`,
        scanlationGroup: OPEN_LIBRARY_NAME,
        publishedAt: null,
        pageCount: scan.pageCount,
      },
    ],
    sourceKey: OPEN_LIBRARY_KEY,
    sourceName: OPEN_LIBRARY_NAME,
    sourceUrl: `${IA_DETAILS}/${encodeURIComponent(scan.iaId)}`,
    coverUrl: scan.coverUrl,
  };
}

export async function resolveBookScan(
  book: ReaderBookRef,
): Promise<ResolvedManga> {
  return resolvedFromScan(book, await findPublicScan(book));
}

export async function getBookPageList(
  payload: string,
  dataSaver = false,
): Promise<ReaderPage[]> {
  const decoded = decodeScanPayload(payload);
  if (!decoded) throw new Error("Invalid book scan");
  let pageCount = decoded.pageCount;
  if (pageCount == null) {
    const scan = await resolveIaScan(decoded.iaId);
    if (!scan) throw new Error("This scan is not publicly readable");
    pageCount = scan.pageCount;
  }
  const pages = pagesForScan(decoded.iaId, pageCount, dataSaver);
  if (pages.length === 0) throw new Error("No pages in this scan");
  return pages;
}

export function isOpenLibraryCatalogHit(doc: {
  title?: string;
  cover_i?: number;
  ia?: string[];
  ebook_access?: string;
  public_scan_b?: boolean;
}): boolean {
  return Boolean(
    coverFromDoc(doc) || (isPublicEbook(doc) && (doc.ia?.length ?? 0) > 0),
  );
}

export function rankOpenLibraryCatalogDocs<T extends OpenLibraryDoc>(
  docs: T[],
  query: string,
): T[] {
  const score = (title: string) => {
    if (titlesMatch(title, query)) return 3;
    const haystack = title.trim().toLowerCase();
    const q = query.trim().toLowerCase();
    if (!q || !haystack) return 0;
    if (haystack === q || haystack.startsWith(`${q} `) || q.startsWith(`${haystack} `)) {
      return 2;
    }
    if (haystack.includes(q) || q.includes(haystack)) return 1;
    return 0;
  };
  return [...docs].sort((left, right) => {
    const delta = score(right.title ?? "") - score(left.title ?? "");
    if (delta !== 0) return delta;
    return Number(isPublicEbook(right)) - Number(isPublicEbook(left));
  });
}

function listingUrlForDoc(doc: OpenLibraryDoc): string {
  if (isPublicEbook(doc) && doc.ia?.[0]) {
    return `${IA_DETAILS}/${encodeURIComponent(doc.ia[0])}`;
  }
  return doc.key
    ? `https://openlibrary.org${doc.key}`
    : "https://openlibrary.org/";
}

export function openLibraryDocToCandidate(
  doc: OpenLibraryDoc,
  fallbackId: string,
): CatalogCandidate {
  const publicScan = isPublicEbook(doc);
  return {
    id: workKeyFromDoc(doc) ?? doc.ia?.[0] ?? doc.key ?? fallbackId,
    title: doc.title?.trim() || "Untitled",
    summary: publicScan
      ? "Public scan from Open Library / Internet Archive."
      : "Listed on Open Library.",
    coverUrl: coverFromDoc(doc),
    publicationStatus: "COMPLETED",
    year: null,
    genres: [],
    isAdult: false,
    author: doc.author_name?.[0] ?? null,
    artist: null,
    lastChapter: doc.number_of_pages_median
      ? String(doc.number_of_pages_median)
      : null,
    url: listingUrlForDoc(doc),
  };
}

export async function searchOpenLibraryCatalog(
  query: string,
  limit = 20,
): Promise<CatalogCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const size = String(Math.min(limit, 40));
  const [byQuery, byTitle] = await Promise.all([
    searchOpenLibrary(searchParams({ q: trimmed, limit: size })),
    searchOpenLibrary(searchParams({ title: trimmed, limit: size })),
  ]);
  const seen = new Set<string>();
  const merged: OpenLibraryDoc[] = [];
  for (const doc of [...(byTitle.docs ?? []), ...(byQuery.docs ?? [])]) {
    const key = workKeyFromDoc(doc) ?? doc.key ?? doc.title ?? "";
    if (!key || seen.has(key) || !isOpenLibraryCatalogHit(doc)) continue;
    seen.add(key);
    merged.push(doc);
  }
  return rankOpenLibraryCatalogDocs(merged, trimmed)
    .slice(0, limit)
    .map((doc) => openLibraryDocToCandidate(doc, trimmed));
}
