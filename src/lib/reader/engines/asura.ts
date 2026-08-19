/**
 * Asura Scans, modeled on Mihon's AsuraScans extension
 * (keiyoushi/extensions-source .../asurascans/AsuraScans.kt).
 */

import type { PublicationStatus } from "@prisma/client";

import {
  parseChapterNumber,
  sourceFetch,
  sourceJson,
  sourceText,
  uniqueUrls,
} from "@/lib/reader/source-fetch";
import {
  encodeChapterId,
  mangaSlugKey,
  titlesMatch,
} from "@/lib/reader/source-id";
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

const API = "https://api.asurascans.com/api";
const SITE = "https://asurascans.com";

const ASURA_FALLBACK_GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Horror",
  "Isekai",
  "Martial Arts",
  "Mystery",
  "Psychological",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Superhero",
  "Supernatural",
  "Thriller",
  "Tragedy",
];

type AsuraSeries = {
  id: number;
  slug: string;
  title: string;
  alt_titles?: string[] | null;
  description?: string | null;
  cover?: string | { url?: string } | null;
  status?: string | null;
  author?: string | null;
  artist?: string | null;
  chapter_count?: number | null;
  public_url?: string | null;
  genres?: { name?: string }[] | string[] | null;
};

function coverUrl(cover: AsuraSeries["cover"]): string | null {
  if (!cover) return null;
  const raw = typeof cover === "string" ? cover : cover.url ?? null;
  if (!raw) return null;
  try {
    return new URL(raw, SITE).toString();
  } catch {
    return raw;
  }
}

function mapStatus(status: string | null | undefined): PublicationStatus {
  switch (status?.toLowerCase()) {
    case "ongoing":
      return "ONGOING";
    case "completed":
    case "complete":
      return "COMPLETED";
    case "hiatus":
      return "ONGOING";
    case "dropped":
    case "cancelled":
      return "CANCELLED";
    default:
      return "UNKNOWN";
  }
}

function genresOf(series: AsuraSeries): string[] {
  const raw = series.genres ?? [];
  return raw
    .map((item) => (typeof item === "string" ? item : item.name ?? ""))
    .filter(Boolean)
    .slice(0, 20);
}

function publicPath(series: AsuraSeries): string {
  if (series.public_url?.startsWith("/")) return series.public_url;
  if (series.public_url) {
    try {
      return new URL(series.public_url, SITE).pathname;
    } catch {
      /* fall through */
    }
  }
  return `/comics/${series.slug}`;
}

function toCandidate(series: AsuraSeries): CatalogCandidate {
  return {
    id: series.slug,
    title: series.title,
    summary: (series.description ?? "").trim().slice(0, 4000) || "No description.",
    coverUrl: coverUrl(series.cover),
    publicationStatus: mapStatus(series.status),
    year: null,
    genres: genresOf(series),
    isAdult: false,
    author: series.author ?? null,
    artist: series.artist ?? null,
    lastChapter: series.chapter_count ? String(series.chapter_count) : null,
    url: `${SITE}${publicPath(series)}`,
  };
}

function slugFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(
    /asura(?:scans|comic)\.[^/]+\/(?:comics|series|manga)\/([^/?#]+)/i,
  );
  return match?.[1] ?? null;
}

async function listSeries(params: {
  query?: string;
  limit: number;
  offset: number;
  order?: string;
  genre?: string;
}): Promise<{ items: AsuraSeries[]; total?: number }> {
  const search = new URLSearchParams();
  search.set("limit", String(params.limit));
  search.set("offset", String(params.offset));
  if (params.query) search.set("search", params.query);
  if (params.order) search.set("order", params.order);
  if (params.genre) {
    search.set("genres", params.genre);
    search.set("genre", params.genre);
  }

  const json = await sourceJson<{
    data?: AsuraSeries[];
    meta?: { total?: number; total_count?: number };
    total?: number;
    count?: number;
  }>(`${API}/series?${search.toString()}`, {
    referer: `${SITE}/`,
    revalidate: 300,
  });

  return {
    items: json.data ?? [],
    total: json.total ?? json.count ?? json.meta?.total ?? json.meta?.total_count,
  };
}

async function searchSeries(query: string): Promise<AsuraSeries[]> {
  const trimmed = query.trim();
  const result = await listSeries({
    query: trimmed || undefined,
    limit: 20,
    offset: 0,
    order: trimmed ? undefined : "rating",
  });
  return result.items;
}

async function browseAsura(query: SourceBrowseQuery): Promise<SourceBrowsePage> {
  const fromUrl = slugFromUrl(query.query);
  if (fromUrl) {
    const candidate = toCandidate(await fetchSeries(fromUrl));
    return { items: [candidate], page: 1, hasMore: false, total: 1 };
  }

  const limit = Math.min(Math.max(query.limit, 1), 32);
  const offset = Math.max(query.page - 1, 0) * limit;
  const trimmed = query.query?.trim() ?? "";
  const result = await listSeries({
    query: trimmed || undefined,
    limit,
    offset,
    order:
      query.sort === "latest"
        ? "latest"
        : query.sort === "updated"
          ? "update"
          : "rating",
    genre: query.categoryId,
  });

  const items = result.items.map(toCandidate);
  const total = result.total;
  const hasMore =
    total != null ? offset + result.items.length < total : result.items.length >= limit;

  return { items, page: query.page, hasMore, total };
}

async function asuraCategories(): Promise<SourceCategory[]> {
  try {
    const json = await sourceJson<{
      data?: { id?: number | string; name?: string; slug?: string }[];
    }>(`${API}/genres`, { referer: `${SITE}/`, revalidate: 86400 });
    const rows = (json.data ?? [])
      .map((row) => {
        const name = row.name?.trim();
        const id = String(row.slug ?? row.name ?? row.id ?? "").trim();
        if (!name || !id) return null;
        return { id, name };
      })
      .filter((row): row is SourceCategory => row != null);
    if (rows.length > 0) {
      return rows.sort((a, b) => a.name.localeCompare(b.name));
    }
  } catch {
    /* fall through to the static list */
  }

  return ASURA_FALLBACK_GENRES.map((name) => ({
    id: name.toLowerCase(),
    name,
  }));
}

function seriesFromPayload(json: unknown): AsuraSeries | null {
  if (!json || typeof json !== "object") return null;
  const record = json as { series?: AsuraSeries; data?: AsuraSeries };
  const series = record.series ?? record.data;
  return series?.slug ? series : null;
}

async function fetchSeries(slug: string): Promise<AsuraSeries> {
  const raw = slug.trim().replace(/^\/+|\/+$/g, "");
  const clean = mangaSlugKey(raw);
  const ids = [...new Set([raw, clean].filter(Boolean))];

  for (const id of ids) {
    const res = await sourceFetch(
      `${API}/series/${encodeURIComponent(id)}`,
      {
        referer: `${SITE}/`,
        accept: "application/json",
        revalidate: 120,
        throwOnError: false,
      },
    );
    if (!res.ok) continue;
    try {
      const series = seriesFromPayload(await res.json());
      if (series) return series;
    } catch {
      /* try the next id */
    }
  }

  const queries = [...new Set([raw, clean, clean.replace(/-/g, " ")])];
  for (const query of queries) {
    const hits = await searchSeries(query);
    const match =
      hits.find((hit) => ids.includes(hit.slug) || mangaSlugKey(hit.slug) === clean) ??
      hits.find((hit) => titlesMatch(hit.title, query));
    if (match) return match;
  }

  throw new Error("Asura Scans title not found");
}

async function fetchChapters(series: AsuraSeries): Promise<ReaderChapter[]> {
  const html = await sourceText(`${SITE}${publicPath(series)}`, {
    referer: `${SITE}/`,
    revalidate: 300,
  });
  const publicSlug =
    publicPath(series).split("/").filter(Boolean).at(-1) ?? series.slug;

  const fromAstro = chaptersFromAstro(html, publicSlug);
  if (fromAstro.length > 0) return fromAstro;

  const nums = [
    ...new Set(
      [...html.matchAll(/\/comics\/[^/"']+\/chapter\/(\d+(?:\.\d+)?)/g)].map(
        (match) => match[1],
      ),
    ),
  ];
  return nums.map((num) => chapterFromNumber(publicSlug, num)).sort(
    (a, b) => a.chapterNumber - b.chapterNumber,
  );
}

function unwrapAstro(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value.length === 0 || value.length === 1) return null;
    if (value.length === 2 && isAstroPrimitiveTag(value[0])) {
      return unwrapAstro(value[1]);
    }
    return value.map(unwrapAstro);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        unwrapAstro(item),
      ]),
    );
  }
  return value;
}

function isAstroPrimitiveTag(value: unknown): boolean {
  return typeof value === "number" || typeof value === "string";
}

function chaptersFromAstro(html: string, publicSlug: string): ReaderChapter[] {
  const decoded = html.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  for (const match of decoded.matchAll(/\bprops="(\{[^"]*\})"/g)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1]);
    } catch {
      continue;
    }
    const unwrapped = unwrapAstro(parsed) as {
      chapters?: {
        number?: number | string;
        is_premium?: boolean;
        isLocked?: boolean;
        published_at?: string | null;
      }[];
    };
    const rows = unwrapped?.chapters;
    if (!Array.isArray(rows) || rows.length === 0) continue;
    return rows
      .filter((row) => !row.isLocked)
      .map((row) =>
        chapterFromNumber(
          publicSlug,
          String(row.number ?? ""),
          row.published_at ?? null,
        ),
      )
      .filter((chapter) => chapter.chapterNumber >= 0)
      .sort((a, b) => a.chapterNumber - b.chapterNumber);
  }
  return [];
}

function chapterFromNumber(
  publicSlug: string,
  num: string,
  publishedAt: string | null = null,
): ReaderChapter {
  const chapterNumber = parseChapterNumber(num);
  return {
    id: encodeChapterId("asurascans", `${publicSlug}:${num}`),
    name: chapterNumber === 0 ? "Prologue" : `Ch.${num}`,
    chapterNumber,
    volume: null,
    title: null,
    scanlationGroup: "Asura Scans",
    publishedAt,
    pageCount: 0,
  };
}

export const asuraEngine: ReaderSourceEngine = {
  key: "asurascans",
  name: "Asura Scans",
  aliases: ["AsuraScans", "Asura Comic", "asuracomic"],
  hosts: ["asurascans.com", "asuracomic.net"],
  imageHosts: ["asurascans.com", "asuracomic.net", "cdn.asurascans.com"],
  imageReferer: `${SITE}/`,

  async search(query) {
    const fromUrl = slugFromUrl(query);
    if (fromUrl) return [toCandidate(await fetchSeries(fromUrl))];
    return (await searchSeries(query)).map(toCandidate);
  },

  browse: browseAsura,
  categories: () => asuraCategories(),

  async getById(id) {
    return toCandidate(await fetchSeries(id));
  },

  async resolveManga(book): Promise<ResolvedManga> {
    const fromUrl = slugFromUrl(book.sourceUrl);
    let series: AsuraSeries | null = null;

    if (fromUrl) {
      series = await fetchSeries(fromUrl);
    } else {
      const hits = await searchSeries(book.title);
      const match =
        hits.find((hit) => titlesMatch(hit.title, book.title)) ??
        hits.find((hit) =>
          (hit.alt_titles ?? []).some((alt) => titlesMatch(alt, book.title)),
        ) ??
        hits[0];
      if (match) series = await fetchSeries(match.slug);
    }

    if (!series) {
      throw new Error("No Asura Scans listing was found for this title.");
    }

    const chapters = await fetchChapters(series);
    return {
      manga: {
        id: series.slug,
        title: series.title,
        originalLanguage: "ko",
        contentRating: null,
      },
      chapters,
      sourceKey: "asurascans",
      sourceName: "Asura Scans",
      sourceUrl: `${SITE}${publicPath(series)}`,
      coverUrl: coverUrl(series.cover),
    };
  },

  async getPageList(payload) {
    const sep = payload.lastIndexOf(":");
    if (sep <= 0) throw new Error("Invalid chapter");
    const slug = payload.slice(0, sep);
    const number = payload.slice(sep + 1);
    const slugs = [...new Set([slug, mangaSlugKey(slug)].filter(Boolean))];
    let urls: string[] = [];
    for (const comicSlug of slugs) {
      const res = await sourceFetch(
        `${SITE}/comics/${comicSlug}/chapter/${number}`,
        {
          referer: `${SITE}/`,
          revalidate: false,
          throwOnError: false,
        },
      );
      if (!res.ok) continue;
      const decoded = (await res.text())
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&");
      urls = uniqueUrls(
        [
          ...decoded.matchAll(
            /https:\/\/cdn\.asurascans\.com\/asura-images\/chapters\/[^"'\s<>]+/g,
          ),
        ].map((match) => match[0].replace(/\\+$/, "")),
      ).filter((url) => /\.(?:webp|jpe?g|png)(?:\?|$)/i.test(url));
      if (urls.length > 0) break;
    }
    if (urls.length === 0) {
      throw new Error("Chapter pages are unavailable");
    }
    return urls.map((url, index) => ({ index, url }));
  },
};
