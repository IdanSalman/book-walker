/**
 * MangaDex catalogue source, modeled on Mihon's MangaDex extension:
 * keiyoushi/extensions-source .../mangadex/MangaDex.kt
 *
 * Hosts no content; chapters and pages come from the public MangaDex API.
 */

import { mangaDexIdFromUrl } from "@/lib/publication";
import { MD_UUID_RE, mangadexFetch } from "@/lib/mangadex-api";
import { normalizeTitle, titlesMatch } from "@/lib/reader/source-id";
import type {
  ReaderChapter,
  ReaderManga,
  ReaderPage,
  ResolvedManga,
} from "@/lib/reader/types";

const CHAPTER_LIMIT = 100;

type LocalizedString = Record<string, string>;

type MangaAttributes = {
  title?: LocalizedString;
  altTitles?: LocalizedString[];
  originalLanguage?: string | null;
  contentRating?: string | null;
  links?: Record<string, string> | null;
  lastChapter?: string | null;
};

type MangaData = {
  id: string;
  attributes?: MangaAttributes;
};

type ChapterAttributes = {
  title?: string | null;
  volume?: string | null;
  chapter?: string | null;
  pages?: number;
  publishAt?: string;
  externalUrl?: string | null;
  isUnavailable?: boolean;
};

type Relationship = {
  id: string;
  type: string;
  attributes?: { name?: string };
};

type ChapterData = {
  id: string;
  attributes?: ChapterAttributes;
  relationships?: Relationship[];
};

type Paginated<T> = {
  data?: T[];
  total?: number;
  limit?: number;
  offset?: number;
};

type AtHomeResponse = {
  baseUrl?: string;
  chapter?: {
    hash?: string;
    data?: string[];
    dataSaver?: string[];
  };
};

export function localizedTitle(title: LocalizedString | undefined): string {
  if (!title) return "";
  return (
    title.en ||
    title["ja-ro"] ||
    title["ko-ro"] ||
    title["zh-ro"] ||
    Object.values(title)[0] ||
    ""
  );
}

function allTitles(attributes: MangaAttributes | undefined): string[] {
  if (!attributes) return [];
  const titles = [localizedTitle(attributes.title)];
  for (const alt of attributes.altTitles ?? []) {
    titles.push(...Object.values(alt));
  }
  return titles.map((t) => t.trim()).filter(Boolean);
}

function contentRatingParams(): string {
  return [
    "safe",
    "suggestive",
    "erotica",
    "pornographic",
  ]
    .map((rating) => `contentRating[]=${rating}`)
    .join("&");
}

function parseChapterNumber(value: string | null | undefined): number {
  if (!value) return -1;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : -1;
}

function chapterName(attr: ChapterAttributes): string {
  const parts: string[] = [];
  if (attr.volume) parts.push(`Vol.${attr.volume}`);
  if (attr.chapter) {
    parts.push(`Ch.${attr.chapter}`);
  } else {
    parts.push("Oneshot");
  }
  const heading = parts.join(" ");
  const title = attr.title?.trim();
  return title ? `${heading} - ${title}` : heading;
}

function mapChapter(data: ChapterData): ReaderChapter | null {
  const attr = data.attributes;
  if (!attr) return null;
  if (attr.isUnavailable) return null;
  if (attr.externalUrl && (attr.pages ?? 0) === 0) return null;
  if ((attr.pages ?? 0) <= 0) return null;

  const group =
    data.relationships?.find((rel) => rel.type === "scanlation_group")
      ?.attributes?.name ?? null;

  return {
    id: data.id,
    name: chapterName(attr),
    chapterNumber: parseChapterNumber(attr.chapter),
    volume: attr.volume ?? null,
    title: attr.title ?? null,
    scanlationGroup: group,
    publishedAt: attr.publishAt ?? null,
    pageCount: attr.pages ?? 0,
  };
}

async function fetchManga(mangaId: string): Promise<ReaderManga> {
  const res = await mangadexFetch(`/manga/${mangaId}`, { revalidate: 3600 });
  const json = (await res.json()) as { data?: MangaData };
  const data = json.data;
  if (!data?.id) {
    throw new Error("MangaDex title not found");
  }
  return {
    id: data.id,
    title: localizedTitle(data.attributes?.title),
    originalLanguage: data.attributes?.originalLanguage ?? null,
    contentRating: data.attributes?.contentRating ?? null,
  };
}

async function searchMangaDex(
  title: string,
  anilistId?: string,
): Promise<string | null> {
  const path =
    `/manga?title=${encodeURIComponent(title)}&limit=10&order[relevance]=desc&${contentRatingParams()}`;
  const res = await mangadexFetch(path, { revalidate: 3600 });
  const json = (await res.json()) as { data?: MangaData[] };
  const results = json.data ?? [];
  if (results.length === 0) return null;

  if (anilistId) {
    const byAnilist = results.find(
      (manga) => manga.attributes?.links?.al === anilistId,
    );
    if (byAnilist) return byAnilist.id;
  }

  const exact = results.find((manga) =>
    allTitles(manga.attributes).some((candidate) =>
      titlesMatch(candidate, title),
    ),
  );
  if (exact) return exact.id;

  const needle = normalizeTitle(title);
  const fuzzy = results.find((manga) =>
    allTitles(manga.attributes).some((candidate) => {
      const value = normalizeTitle(candidate);
      return (
        value.length > 0 &&
        (value.includes(needle) || needle.includes(value))
      );
    }),
  );
  if (fuzzy) return fuzzy.id;

  return results.length === 1 || needle.length >= 8 ? results[0]?.id ?? null : null;
}

export async function resolveMangaDexManga(book: {
  title: string;
  sourceUrl: string | null;
  externalId: string | null;
}): Promise<ReaderManga> {
  const fromUrl = mangaDexIdFromUrl(book.sourceUrl);
  if (fromUrl) {
    return fetchManga(fromUrl);
  }

  const anilistId = book.externalId?.startsWith("anilist:")
    ? book.externalId.slice("anilist:".length)
    : undefined;

  const foundId = await searchMangaDex(book.title, anilistId);
  if (!foundId) {
    throw new Error("No MangaDex listing was found for this title.");
  }
  return fetchManga(foundId);
}

async function fetchFeedPage(
  mangaId: string,
  language: string,
  offset: number,
): Promise<Paginated<ChapterData>> {
  const path =
    `/manga/${mangaId}/feed?limit=${CHAPTER_LIMIT}&offset=${offset}` +
    `&translatedLanguage[]=${encodeURIComponent(language)}` +
    `&includeFuturePublishAt=0&includeExternalUrl=0&includeUnavailable=0` +
    `&order[chapter]=asc&order[volume]=asc&includes[]=scanlation_group` +
    `&${contentRatingParams()}`;
  const res = await mangadexFetch(path, { revalidate: 300 });
  return (await res.json()) as Paginated<ChapterData>;
}

async function fetchAllChapters(
  mangaId: string,
  language: string,
): Promise<ReaderChapter[]> {
  const chapters: ReaderChapter[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const page = await fetchFeedPage(mangaId, language, offset);
    total = page.total ?? 0;
    const mapped = (page.data ?? [])
      .map(mapChapter)
      .filter((chapter): chapter is ReaderChapter => chapter != null);
    chapters.push(...mapped);
    offset += CHAPTER_LIMIT;
    if ((page.data?.length ?? 0) === 0) break;
  }

  return chapters;
}

export async function getChapterList(mangaId: string): Promise<ReaderChapter[]> {
  let chapters = await fetchAllChapters(mangaId, "en");
  if (chapters.length === 0) {
    chapters = await fetchAllChapters(mangaId, "ja");
  }
  return chapters;
}

export async function getMangaWithChapters(book: {
  title: string;
  sourceUrl: string | null;
  externalId: string | null;
}): Promise<ResolvedManga> {
  const manga = await resolveMangaDexManga(book);
  const chapters = await getChapterList(manga.id);
  return {
    manga,
    chapters,
    sourceKey: "mangadex",
    sourceName: "MangaDex",
    sourceUrl: `https://mangadex.org/title/${manga.id}`,
  };
}

export function isChapterId(value: string): boolean {
  return MD_UUID_RE.test(value);
}

/**
 * Page list from MD@Home, matching MangaDex.kt pageListRequest / getPageList.
 */
export async function getPageList(
  chapterId: string,
  dataSaver = false,
  options?: { forcePort443?: boolean },
): Promise<ReaderPage[]> {
  if (!isChapterId(chapterId)) {
    throw new Error("Invalid chapter");
  }

  const forcePort443 = options?.forcePort443 === true;
  const res = await mangadexFetch(
    `/at-home/server/${chapterId}?forcePort443=${forcePort443}`,
    { revalidate: false },
  );
  const json = (await res.json()) as AtHomeResponse;
  const baseUrl = json.baseUrl;
  const hash = json.chapter?.hash;
  const files = dataSaver
    ? json.chapter?.dataSaver
    : json.chapter?.data;

  if (!baseUrl || !hash || !files?.length) {
    throw new Error("Chapter pages are unavailable");
  }

  const quality = dataSaver ? "data-saver" : "data";
  return files.map((file, index) => ({
    index,
    url: `${baseUrl}/${quality}/${hash}/${file}`,
  }));
}
