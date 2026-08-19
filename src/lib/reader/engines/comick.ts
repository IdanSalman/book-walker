/**
 * Comick, modeled on Mihon's Comick.kt
 * (keiyoushi/extensions-source .../comickfun/Comick.kt).
 * Browse/search go through the public API; covers prefer cover_url then
 * language-matched md_covers (PR #6399).
 */

import type { PublicationStatus } from "@prisma/client";

import { asuraEngine } from "@/lib/reader/engines/asura";
import { createSiteEngine } from "@/lib/reader/engines/site";
import { assertNotBlocked, originOf } from "@/lib/reader/html";
import {
  parseChapterNumber,
  sourceFetch,
  uniqueUrls,
} from "@/lib/reader/source-fetch";
import {
  encodeChapterId,
  normalizeTitle,
  titlesMatch,
} from "@/lib/reader/source-id";
import type { ReaderSourceEngine } from "@/lib/reader/source-engine";
import type {
  CatalogCandidate,
  ReaderChapter,
  ReaderPage,
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

type ComickLink = {
  id?: string | null;
  slug?: string | null;
  enable?: boolean | null;
};

type ComickChapterDetail = {
  chapter?: {
    chap?: string | number | null;
    images?: ComickPage[];
    md_images?: ComickPage[];
    group_name?: string[] | null;
    md_chapters_groups?: {
      md_groups?: { slug?: string | null; title?: string | null };
    }[];
    md_comics?: {
      title?: string | null;
      slug?: string | null;
      links2?: ComickLink[];
    };
  };
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

function compactToken(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function pageUrlsFromImages(images: ComickPage[] | undefined): string[] {
  return uniqueUrls(
    (images ?? [])
      .map((image) => {
        if (image.url?.startsWith("http")) return image.url;
        if (image.b2key) return `${COVER}/${image.b2key.replace(/^\//, "")}`;
        return null;
      })
      .filter((url): url is string => Boolean(url)),
  );
}

function toPages(urls: string[], referer?: string): ReaderPage[] {
  return urls.map((url, index) =>
    referer ? { index, url, referer } : { index, url },
  );
}

function pickOriginalLink(
  links: ComickLink[] | undefined,
  groupSlug: string | null,
  groupTitle: string | null,
): ComickLink | null {
  const enabled = (links ?? []).filter(
    (link) => link.enable !== false && (link.id || link.slug),
  );
  if (enabled.length === 0) return null;
  const needles = [groupSlug, groupTitle].map(compactToken).filter(Boolean);
  return (
    enabled.find((link) => {
      const id = compactToken(link.id);
      return needles.some(
        (needle) => id === needle || id.includes(needle) || needle.includes(id),
      );
    }) ?? enabled[0]
  );
}

async function groupSiteOrigin(groupSlug: string): Promise<string | null> {
  const json = await comickJsonOrNull<{ group?: { links?: string[] } }>(
    `/group/${encodeURIComponent(groupSlug)}`,
    3600,
  );
  const link = json?.group?.links?.find((item) => /^https?:\/\//i.test(item));
  if (!link) return null;
  try {
    return originOf(link);
  } catch {
    return null;
  }
}

async function pagesFromEngineChapter(
  engine: ReturnType<typeof createSiteEngine>,
  origin: string,
  paths: string[],
): Promise<ReaderPage[]> {
  const referer = `${origin}/`;
  for (const path of paths) {
    try {
      const pages = await engine.getPageList(path);
      if (pages.length > 0) {
        return pages.map((page) => ({
          ...page,
          referer: page.referer ?? referer,
        }));
      }
    } catch {
      /* try the next constructed chapter URL */
    }
  }
  return [];
}

function chapterPathCandidates(seriesSlug: string, chap: string): string[] {
  return [
    `/comics/${seriesSlug}/chapter/${chap}`,
    `/${seriesSlug}-chapter-${chap}/`,
    `/series/${seriesSlug}/chapter-${chap}/`,
    `/manga/${seriesSlug}/chapter-${chap}/`,
  ];
}

const SKIP_ORIGINAL_IDS = new Set([
  "amazon",
  "bato",
  "batoto",
  "kakao",
  "kagane",
  "reaper",
  "reaperscans",
  "tapas",
  "webtoon",
  "webtoons",
  "yenpress",
]);

const KNOWN_ORIGINAL_ORIGINS: Record<string, string> = {
  asura: "https://asurascans.com",
  asurascans: "https://asurascans.com",
};

function originalLinkId(link: ComickLink): string {
  return (link.id ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isSkippedOriginal(id: string): boolean {
  return [...SKIP_ORIGINAL_IDS].some(
    (skip) => id === skip || id.includes(skip),
  );
}

async function pagesFromAsuraLink(
  slug: string,
  chap: string,
): Promise<ReaderPage[]> {
  try {
    const pages = await asuraEngine.getPageList(`${slug}:${chap}`);
    if (pages.length === 0) return [];
    return pages.map((page) => ({
      ...page,
      referer: page.referer ?? asuraEngine.imageReferer,
    }));
  } catch {
    return [];
  }
}

async function originForLink(
  link: ComickLink,
  fallbackSlug: string | null,
): Promise<string | null> {
  const host = originalLinkId(link);
  if (isSkippedOriginal(host)) return null;
  const known = KNOWN_ORIGINAL_ORIGINS[host];
  if (known) return known;
  const slugs = [fallbackSlug, host].filter((value, index, all): value is string => {
    return Boolean(value) && all.indexOf(value) === index;
  });
  for (const slug of slugs) {
    if (isSkippedOriginal(slug)) continue;
    const origin = await groupSiteOrigin(slug);
    if (origin) return origin;
  }
  return null;
}

async function pagesFromOriginalSite(
  detail: ComickChapterDetail,
): Promise<ReaderPage[]> {
  const chapter = detail.chapter;
  if (!chapter) return [];
  const groupSlug =
    chapter.md_chapters_groups
      ?.map((row) => row.md_groups?.slug?.trim())
      .find(Boolean) ??
    chapter.group_name
      ?.map((name) => name.trim().toLowerCase().replace(/\s+/g, "-"))
      .find(Boolean) ??
    null;
  const groupTitle = chapter.group_name?.find(Boolean) ?? null;
  const chap =
    chapter.chap != null ? String(chapter.chap).replace(/\.0$/, "") : "";
  const chapterNumber = parseChapterNumber(chap);
  if (chapterNumber < 0) return [];

  const matched = pickOriginalLink(
    chapter.md_comics?.links2,
    groupSlug,
    groupTitle,
  );
  const links = [
    matched,
    ...(chapter.md_comics?.links2 ?? []).filter((link) => link !== matched),
  ].filter((link): link is ComickLink => Boolean(link?.slug));

  const asuraLink = links.find((link) => {
    const id = originalLinkId(link);
    return id.includes("asura");
  });
  if (asuraLink?.slug) {
    const pages = await pagesFromAsuraLink(asuraLink.slug, chap);
    if (pages.length > 0) return pages;
  }

  const seenOrigins = new Set<string>();
  let attempts = 0;
  for (const link of links) {
    if (attempts >= 2) break;
    if (originalLinkId(link).includes("asura")) continue;
    const origin = await originForLink(link, groupSlug);
    if (!origin || seenOrigins.has(origin)) continue;
    seenOrigins.add(origin);
    const seriesSlug = link.slug?.trim();
    if (!seriesSlug) continue;
    attempts += 1;

    const engine = createSiteEngine({
      key: "comick-origin",
      name: groupTitle || "Comick",
      baseUrl: origin,
    });
    const pages = await pagesFromEngineChapter(
      engine,
      origin,
      chapterPathCandidates(seriesSlug, chap),
    );
    if (pages.length > 0) return pages;
  }
  return [];
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
    // tachiyomi=true no longer includes page lists; use the public chapter
    // payload (md_images) and /get_images, then the original scanlation site.
    const json = await comickJson<ComickChapterDetail>(
      `/chapter/${encodeURIComponent(payload)}`,
      false,
    );
    let urls = pageUrlsFromImages(
      json.chapter?.md_images ?? json.chapter?.images,
    );
    if (urls.length === 0) {
      const listed = await comickJsonOrNull<ComickPage[]>(
        `/chapter/${encodeURIComponent(payload)}/get_images`,
        false,
      );
      urls = pageUrlsFromImages(listed ?? undefined);
    }
    if (urls.length > 0) return toPages(urls);

    const fallback = await pagesFromOriginalSite(json);
    if (fallback.length > 0) return fallback;

    throw new Error("Chapter pages are unavailable");
  },
};
