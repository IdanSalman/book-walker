/**
 * Asura Scans, modeled on Mihon's AsuraScans extension
 * (keiyoushi/extensions-source .../asurascans/AsuraScans.kt).
 */

import type { PublicationStatus } from "@prisma/client";

import {
  parseChapterNumber,
  sourceJson,
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

async function fetchSeries(slug: string): Promise<AsuraSeries> {
  const clean = slug.replace(/-[a-z0-9]{8}$/i, "");
  const json = await sourceJson<{ series?: AsuraSeries }>(
    `${API}/series/${encodeURIComponent(clean)}`,
    { referer: `${SITE}/`, revalidate: 300 },
  );
  if (!json.series?.slug) {
    throw new Error("Asura Scans title not found");
  }
  return json.series;
}

async function fetchChapters(series: AsuraSeries): Promise<ReaderChapter[]> {
  const html = await sourceText(`${SITE}${publicPath(series)}`, {
    referer: `${SITE}/`,
    revalidate: 300,
  });
  const publicSlug =
    publicPath(series).split("/").filter(Boolean).at(-1) ?? series.slug;
  const nums = [
    ...new Set(
      [...html.matchAll(/\/comics\/[^/"']+\/chapter\/(\d+(?:\.\d+)?)/g)].map(
        (match) => match[1],
      ),
    ),
  ];

  return nums
    .map((num) => {
      const chapterNumber = parseChapterNumber(num);
      return {
        id: encodeChapterId("asurascans", `${publicSlug}:${num}`),
        name: chapterNumber === 0 ? "Prologue" : `Ch.${num}`,
        chapterNumber,
        volume: null,
        title: null,
        scanlationGroup: "Asura Scans",
        publishedAt: null,
        pageCount: 0,
      } satisfies ReaderChapter;
    })
    .sort((a, b) => a.chapterNumber - b.chapterNumber);
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
    const html = await sourceText(`${SITE}/comics/${slug}/chapter/${number}`, {
      referer: `${SITE}/`,
      revalidate: false,
    });
    const urls = uniqueUrls(
      [...html.matchAll(
        /https:\/\/cdn\.asurascans\.com\/asura-images\/chapters\/[^"'\\\s<&]+/g,
      )].map((match) => match[0].replace(/\\+$/, "")),
    ).filter((url) => /\.(?:webp|jpe?g|png)(?:\?|$)/i.test(url));
    if (urls.length === 0) {
      throw new Error("Chapter pages are unavailable");
    }
    return urls.map((url, index) => ({ index, url }));
  },
};
