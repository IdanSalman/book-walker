/**
 * Comick, modeled on Mihon's Comick.kt
 * (keiyoushi/extensions-source .../comickfun/Comick.kt).
 * Browse/search go through the public API; covers prefer cover_url then
 * language-matched md_covers (PR #6399).
 */

import type { PublicationStatus } from "@prisma/client";

import { assertNotBlocked } from "@/lib/reader/html";
import {
  parseChapterNumber,
  sourceFetch,
  uniqueUrls,
} from "@/lib/reader/source-fetch";
import { encodeChapterId, normalizeTitle, titlesMatch } from "@/lib/reader/source-id";
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

const SITE = "https://comick.dev";
const API = "https://api.comick.dev";
const COVER = "https://meo.comick.pictures";
const LANG = "en";
const TACHIYOMI_UA =
  "Tachiyomi Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

type MdCover = {
  b2key?: string | null;
  locale?: string | null;
};

type MdTitle = {
  title?: string | null;
  lang?: string | null;
};

type ComickSearchHit = {
  hid?: string;
  slug?: string;
  title?: string;
  desc?: string | null;
  status?: number | null;
  year?: number | null;
  last_chapter?: number | string | null;
  content_rating?: string | null;
  country?: string | null;
  iso639_1?: string | null;
  author?: string | null;
  artist?: string | null;
  md_covers?: MdCover[];
  md_titles?: MdTitle[];
  cover_url?: string | null;
};

type ComickDetails = {
  comic?: ComickSearchHit & {
    hid: string;
    title: string;
    authors?: { name?: string }[];
  };
  authors?: { name?: string }[];
  artists?: { name?: string }[];
};

type ComickChapter = {
  hid?: string;
  chap?: string | number | null;
  vol?: string | number | null;
  title?: string | null;
  lang?: string | null;
  created_at?: string | null;
  group_name?: string[] | null;
};

type ComickPage = {
  url?: string | null;
  b2key?: string | null;
};

async function comickJson<T>(
  path: string,
  revalidate: number | false = 300,
): Promise<T> {
  const json = await comickJsonOrNull<T>(path, revalidate);
  if (json == null) {
    throw new Error("Comick title or chapter list is unavailable (blocked or missing).");
  }
  return json;
}

async function comickJsonOrNull<T>(
  path: string,
  revalidate: number | false = 300,
): Promise<T | null> {
  const url = path.startsWith("http") ? path : `${API}${path}`;
  const res = await sourceFetch(url, {
    referer: `${SITE}/`,
    accept: "application/json",
    revalidate,
    throwOnError: false,
    headers: {
      Origin: SITE,
      "User-Agent": TACHIYOMI_UA,
    },
  });
  if (!res.ok) return null;
  const text = await res.text();
  if (!text || text.trimStart().startsWith("<")) {
    assertNotBlocked(text || "<html>", "Comick");
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Prefer the API cover_url (usually a JPEG thumb), then full md_covers. */
function parseCover(
  coverUrl: string | null | undefined,
  covers: MdCover[] | undefined,
  origLang?: string | null,
): string | null {
  if (coverUrl?.trim()) {
    const raw = coverUrl.trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    return `${COVER}/${raw.replace(/^\//, "")}`;
  }
  const list = covers ?? [];
  const pick =
    list.find(
      (cover) => cover.b2key && cover.locale?.toLowerCase().startsWith(LANG),
    ) ??
    (origLang
      ? list.find(
          (cover) =>
            cover.b2key &&
            cover.locale?.toLowerCase().startsWith(origLang.toLowerCase()),
        )
      : undefined) ??
    list.find((cover) => cover.b2key);
  return pick?.b2key ? `${COVER}/${pick.b2key.replace(/^\//, "")}` : null;
}

function mapStatus(status: number | null | undefined): PublicationStatus {
  switch (status) {
    case 1:
      return "ONGOING";
    case 2:
      return "COMPLETED";
    case 3:
      return "CANCELLED";
    case 4:
      return "HIATUS";
    default:
      return "UNKNOWN";
  }
}

function isAdultRating(rating: string | null | undefined): boolean {
  return /erotica|pornographic|adult/i.test(rating ?? "");
}

function comicSiteUrl(comic: Pick<ComickSearchHit, "slug" | "hid">): string {
  const path = comic.slug?.trim()
    ? `/comic/${comic.slug.trim()}`
    : `/comic/${comic.hid?.trim() ?? ""}`;
  return `${SITE}${path}`;
}

async function candidateFromHit(
  hit: ComickSearchHit,
): Promise<CatalogCandidate | null> {
  const first = toCandidate(hit);
  if (!first) return null;
  if (first.coverUrl) return first;
  const details = await fetchComicDetails(hit.slug || hit.hid || "");
  if (!details) return first;
  return toCandidate(details) ?? first;
}

async function candidatesFromHits(
  hits: ComickSearchHit[],
): Promise<CatalogCandidate[]> {
  const items: CatalogCandidate[] = [];
  for (const hit of hits) {
    const candidate = await candidateFromHit(hit);
    if (candidate) items.push(candidate);
  }
  return items;
}

function toCandidate(hit: ComickSearchHit): CatalogCandidate | null {
  const hid = hit.hid?.trim();
  const slug = hit.slug?.trim();
  const title = hit.title?.trim();
  if (!hid || !title) return null;
  return {
    // Slug, not hid: Cloudflare often 403s `/comic/{hid}` but allows `/comic/{slug}`.
    id: slug || hid,
    title,
    summary: (hit.desc ?? "").trim().slice(0, 4000) || "No description.",
    coverUrl: parseCover(hit.cover_url, hit.md_covers, hit.iso639_1 ?? hit.country),
    publicationStatus: mapStatus(hit.status),
    year: hit.year ?? null,
    genres: [],
    isAdult: isAdultRating(hit.content_rating),
    author: hit.author ?? null,
    artist: hit.artist ?? null,
    lastChapter: hit.last_chapter != null ? String(hit.last_chapter) : null,
    url: comicSiteUrl(hit),
  };
}

function slugFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(
    /comick\.(?:dev|io|fun|app|ink|cc)\/comic\/([^/?#]+)/i,
  );
  return match?.[1] ?? null;
}

function sortParam(sort: SourceBrowseQuery["sort"]): string {
  if (sort === "latest") return "created_at";
  if (sort === "updated") return "uploaded";
  return "user_follow_count";
}

async function searchComick(params: {
  query?: string;
  page: number;
  limit: number;
  sort?: SourceBrowseQuery["sort"];
  required?: boolean;
}): Promise<ComickSearchHit[]> {
  const search = new URLSearchParams({
    tachiyomi: "true",
    page: String(Math.max(params.page, 1)),
    limit: String(params.limit),
    sort: sortParam(params.sort ?? "popular"),
  });
  if (params.query?.trim()) {
    search.set("q", params.query.trim());
    search.set("t", "true");
  }
  const json = await comickJsonOrNull<ComickSearchHit[] | { message?: string }>(
    `/v1.0/search?${search.toString()}`,
  );
  if (json == null) {
    if (params.required) {
      throw new Error("Comick search is unavailable.");
    }
    return [];
  }
  if (!Array.isArray(json)) return [];
  return json;
}

function comicFromDetails(json: ComickDetails): ComickSearchHit | null {
  const comic = json.comic;
  if (!comic?.hid) return null;
  return {
    ...comic,
    author:
      json.authors?.map((row) => row.name).filter(Boolean).join(", ") ||
      comic.author,
    artist:
      json.artists?.map((row) => row.name).filter(Boolean).join(", ") ||
      comic.artist,
  };
}

async function fetchComicDetails(id: string): Promise<ComickSearchHit | null> {
  const clean = id.replace(/#.*$/, "").replace(/^\/comic\//, "");
  if (!clean) return null;
  const json = await comickJsonOrNull<ComickDetails>(
    `/comic/${encodeURIComponent(clean)}?tachiyomi=true`,
  );
  return json ? comicFromDetails(json) : null;
}

function namesOf(hit: ComickSearchHit): string[] {
  return [
    hit.title,
    ...(hit.md_titles ?? []).map((row) => row.title),
  ].filter((name): name is string => Boolean(name?.trim()));
}

function pickSearchHit(
  hits: ComickSearchHit[],
  idOrTitle: string,
): ComickSearchHit | undefined {
  const needle = idOrTitle.trim();
  const normalized = normalizeTitle(needle);
  return (
    hits.find((hit) => hit.slug === needle || hit.hid === needle) ??
    hits.find((hit) => namesOf(hit).some((name) => titlesMatch(name, needle))) ??
    (normalized.length >= 8
      ? hits.find((hit) =>
          namesOf(hit).some((name) => {
            const candidate = normalizeTitle(name);
            return (
              candidate.includes(normalized) || normalized.includes(candidate)
            );
          }),
        )
      : undefined)
  );
}

async function fetchComic(id: string): Promise<ComickSearchHit> {
  const fromDetails = await fetchComicDetails(id);
  if (fromDetails) return fromDetails;

  const hits = await searchComick({ query: id, page: 1, limit: 20 });
  const match = pickSearchHit(hits, id);
  if (match?.slug && match.slug !== id) {
    const viaSlug = await fetchComicDetails(match.slug);
    if (viaSlug) return viaSlug;
  }
  if (match?.hid) return match;

  throw new Error("Comick title not found");
}

function parseChapterRows(rows: ComickChapter[]): ReaderChapter[] {
  const seen = new Set<string>();
  const chapters: ReaderChapter[] = [];
  for (const row of rows) {
    const chapHid = row.hid?.trim();
    if (!chapHid || seen.has(chapHid)) continue;
    if (row.lang && !row.lang.toLowerCase().startsWith(LANG)) continue;
    seen.add(chapHid);
    const chap = row.chap != null ? String(row.chap) : "";
    const name =
      [chap && `Ch. ${chap}`, row.title].filter(Boolean).join(" — ") || "Chapter";
    chapters.push({
      id: encodeChapterId("comick", chapHid),
      name,
      chapterNumber: parseChapterNumber(chap || name),
      volume: row.vol != null ? String(row.vol) : null,
      title: row.title ?? null,
      scanlationGroup: row.group_name?.filter(Boolean).join(", ") || null,
      publishedAt: row.created_at ?? null,
      pageCount: 0,
    });
  }
  chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
  return chapters;
}

async function fetchChapters(comic: ComickSearchHit): Promise<ReaderChapter[]> {
  const ids = [...new Set([comic.slug, comic.hid].filter(Boolean) as string[])];
  for (const id of ids) {
    const json = await comickJsonOrNull<{ chapters?: ComickChapter[] }>(
      `/comic/${encodeURIComponent(id)}/chapters?lang=${LANG}&limit=10000&tachiyomi=true`,
    );
    const chapters = parseChapterRows(json?.chapters ?? []);
    if (chapters.length > 0) return chapters;
  }

  const hid = comic.hid;
  if (!hid) return [];
  const chapters: ReaderChapter[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const json = await comickJsonOrNull<{ chapters?: ComickChapter[] }>(
      `/comic/${encodeURIComponent(hid)}/chapters?lang=${LANG}&page=${page}&limit=100&tachiyomi=true`,
    );
    const rows = json?.chapters ?? [];
    if (rows.length === 0) break;
    chapters.push(...parseChapterRows(rows));
    if (rows.length < 100) break;
  }
  const seen = new Set<string>();
  return chapters.filter((chapter) => {
    if (seen.has(chapter.id)) return false;
    seen.add(chapter.id);
    return true;
  }).sort((a, b) => a.chapterNumber - b.chapterNumber);
}

export function isComickSource(source: {
  key?: string;
  name?: string;
  baseUrl?: string;
}): boolean {
  const key = source.key?.toLowerCase() ?? "";
  const name = source.name?.toLowerCase().replace(/[^a-z0-9]+/g, "") ?? "";
  if (key.includes("comick") || name === "comick") return true;
  try {
    const host = new URL(source.baseUrl ?? "").hostname.toLowerCase();
    return /comick\.(dev|io|fun|app|ink|cc)$/.test(host.replace(/^www\./, ""));
  } catch {
    return false;
  }
}

export const comickEngine: ReaderSourceEngine = {
  key: "comick",
  name: "Comick",
  aliases: ["ComicK", "Comickfun", "comick.io", "comick.dev"],
  hosts: ["comick.dev", "comick.io", "comick.fun", "comick.app", "api.comick.dev"],
  imageHosts: [
    "meo.comick.pictures",
    "comick.pictures",
    "comicknew.pictures",
    "comick.dev",
    "comick.io",
  ],
  imageReferer: `${SITE}/`,

  async search(query) {
    const fromUrl = slugFromUrl(query);
    if (fromUrl) {
      const candidate = toCandidate(await fetchComic(fromUrl));
      return candidate ? [candidate] : [];
    }
    return candidatesFromHits(
      await searchComick({ query, page: 1, limit: 20 }),
    );
  },

  async browse(query: SourceBrowseQuery): Promise<SourceBrowsePage> {
    const fromUrl = slugFromUrl(query.query);
    if (fromUrl) {
      const candidate = toCandidate(await fetchComic(fromUrl));
      return {
        items: candidate ? [candidate] : [],
        page: 1,
        hasMore: false,
        total: candidate ? 1 : 0,
      };
    }
    const limit = Math.min(Math.max(query.limit, 1), 50);
    const hits = await searchComick({
      query: query.query,
      page: query.page,
      limit,
      sort: query.sort,
      required: true,
    });
    let items = await candidatesFromHits(hits);
    if (query.hideAdult) items = items.filter((item) => !item.isAdult);
    return {
      items,
      page: query.page,
      hasMore: hits.length >= limit,
    };
  },

  async getById(id) {
    const candidate = toCandidate(await fetchComic(id));
    if (!candidate) throw new Error("Comick title not found");
    return candidate;
  },

  async resolveManga(book): Promise<ResolvedManga> {
    const fromUrl = slugFromUrl(book.sourceUrl);
    let comic: ComickSearchHit | null = null;
    if (fromUrl) {
      comic = await fetchComic(fromUrl).catch(() => null);
    }
    if (!comic && book.externalId?.trim()) {
      comic = await fetchComic(book.externalId.trim()).catch(() => null);
    }
    if (!comic) {
      const hits = await searchComick({
        query: book.title,
        page: 1,
        limit: 20,
      });
      const match = pickSearchHit(hits, book.title) ?? hits[0];
      if (match?.slug) {
        comic = (await fetchComicDetails(match.slug)) ?? match;
      } else if (match?.hid) {
        comic = match;
      }
    }
    if (!comic?.hid) {
      throw new Error("No Comick listing was found for this title.");
    }
    const chapters = await fetchChapters(comic);
    if (chapters.length === 0) {
      throw new Error("Comick: no readable chapters");
    }
    return {
      manga: {
        id: comic.hid,
        title: comic.title ?? book.title,
        originalLanguage: comic.country ?? comic.iso639_1 ?? null,
        contentRating: comic.content_rating ?? null,
      },
      chapters,
      sourceKey: "comick",
      sourceName: "Comick",
      sourceUrl: comicSiteUrl(comic),
      coverUrl: parseCover(
        comic.cover_url,
        comic.md_covers,
        comic.iso639_1 ?? comic.country,
      ),
    };
  },

  async getPageList(payload) {
    const json = await comickJson<{
      chapter?: { images?: ComickPage[]; md_images?: ComickPage[] };
    }>(`/chapter/${encodeURIComponent(payload)}?tachiyomi=true`, false);
    const images = json.chapter?.images ?? json.chapter?.md_images ?? [];
    const urls = uniqueUrls(
      images
        .map((image) => {
          if (image.url?.startsWith("http")) return image.url;
          if (image.b2key) return `${COVER}/${image.b2key}`;
          return null;
        })
        .filter((url): url is string => Boolean(url)),
    );
    if (urls.length === 0) {
      throw new Error("Chapter pages are unavailable");
    }
    return urls.map((url, index) => ({ index, url }));
  },
};
