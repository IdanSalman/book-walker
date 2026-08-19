/**
 * Catalog importer for the MangaDex source: search the public API, then write
 * matching titles into the shared Book catalog.
 */

import type { PublicationStatus } from "@prisma/client";

import { hasAdultGenre } from "@/lib/adult-content";
import { MD_UUID_RE, mangadexFetch } from "@/lib/mangadex-api";
import { prisma } from "@/lib/prisma";
import { mangaDexIdFromUrl } from "@/lib/publication";
import { localizedTitle } from "@/lib/reader/mangadex-source";
import type {
  SourceBrowsePage,
  SourceBrowseQuery,
  SourceCategory,
} from "@/lib/sources/browse";
import {
  importCatalogCandidate,
  type ImportExtras,
  type ImportOutcome,
} from "@/lib/sources/import-title";
import { fetchMangaDexByUrl, mapMangaDexStatus } from "@/lib/sync/book-metadata";

const INCLUDES = "includes[]=cover_art&includes[]=author&includes[]=artist";
const ADULT_RATINGS = new Set(["erotica", "pornographic"]);

type LocalizedString = Record<string, string>;

type Relationship = {
  id: string;
  type: string;
  attributes?: { name?: string; fileName?: string };
};

type MangaData = {
  id: string;
  attributes?: {
    title?: LocalizedString;
    description?: LocalizedString;
    status?: string | null;
    year?: number | null;
    contentRating?: string | null;
    lastChapter?: string | null;
    links?: Record<string, string> | null;
    tags?: { attributes?: { name?: LocalizedString; group?: string } }[];
  };
  relationships?: Relationship[];
};

export type MangaDexCandidate = {
  id: string;
  title: string;
  summary: string;
  coverUrl: string | null;
  publicationStatus: PublicationStatus;
  year: number | null;
  genres: string[];
  isAdult: boolean;
  author: string | null;
  artist: string | null;
  lastChapter: string | null;
  anilistId: string | null;
  url: string;
};

function titleUrl(mangaId: string): string {
  return `https://mangadex.org/title/${mangaId}`;
}

function relationshipName(
  relationships: Relationship[] | undefined,
  type: string,
): string | null {
  const name = relationships?.find((rel) => rel.type === type)?.attributes?.name;
  return name?.trim() || null;
}

function coverUrlFor(manga: MangaData): string | null {
  const fileName = manga.relationships?.find((rel) => rel.type === "cover_art")
    ?.attributes?.fileName;
  return fileName
    ? `https://uploads.mangadex.org/covers/${manga.id}/${fileName}`
    : null;
}

function genresFor(manga: MangaData): string[] {
  const tags = manga.attributes?.tags ?? [];
  return tags
    .filter((tag) => {
      const group = tag.attributes?.group;
      return group === "genre" || group === "theme" || group === "format";
    })
    .map((tag) => localizedTitle(tag.attributes?.name))
    .filter(Boolean)
    .slice(0, 20);
}

function mapCandidate(manga: MangaData): MangaDexCandidate {
  const attributes = manga.attributes;
  const summary =
    localizedTitle(attributes?.description).trim().slice(0, 4000) ||
    "No description provided by MangaDex.";
  const anilistId = attributes?.links?.al?.trim();

  return {
    id: manga.id,
    title: localizedTitle(attributes?.title) || "Untitled",
    summary,
    coverUrl: coverUrlFor(manga),
    publicationStatus: mapMangaDexStatus(attributes?.status),
    year: attributes?.year ?? null,
    genres: genresFor(manga),
    isAdult: ADULT_RATINGS.has((attributes?.contentRating ?? "").toLowerCase()),
    author: relationshipName(manga.relationships, "author"),
    artist: relationshipName(manga.relationships, "artist"),
    lastChapter: attributes?.lastChapter?.trim() || null,
    anilistId: anilistId && /^\d+$/.test(anilistId) ? anilistId : null,
    url: titleUrl(manga.id),
  };
}

function mangaIdFromQuery(query: string): string | null {
  const trimmed = query.trim();
  if (MD_UUID_RE.test(trimmed)) return trimmed;
  return mangaDexIdFromUrl(trimmed);
}

async function fetchMangaById(mangaId: string): Promise<MangaData> {
  const res = await mangadexFetch(`/manga/${mangaId}?${INCLUDES}`, {
    revalidate: false,
  });
  const json = (await res.json()) as { data?: MangaData };
  if (!json.data?.id) {
    throw new Error("MangaDex title not found");
  }
  return json.data;
}

function contentRatingQuery(hideAdult: boolean): string {
  const ratings = hideAdult
    ? ["safe", "suggestive"]
    : ["safe", "suggestive", "erotica", "pornographic"];
  return ratings.map((rating) => `contentRating[]=${rating}`).join("&");
}

function orderQuery(sort: SourceBrowseQuery["sort"], hasQuery: boolean): string {
  if (hasQuery) return "order[relevance]=desc";
  if (sort === "latest") return "order[createdAt]=desc";
  if (sort === "updated") return "order[latestUploadedChapter]=desc";
  return "order[followedCount]=desc";
}

/**
 * Live MangaDex listings: popular, newest on the site, optional tag filter,
 * and title search. A UUID or mangadex.org URL resolves that single title.
 */
export async function browseMangaDex(
  query: SourceBrowseQuery,
): Promise<SourceBrowsePage> {
  const directId = mangaIdFromQuery(query.query ?? "");
  if (directId) {
    const candidate = mapCandidate(await fetchMangaById(directId));
    if (query.hideAdult && candidate.isAdult) {
      return { items: [], page: 1, hasMore: false, total: 0 };
    }
    return { items: [candidate], page: 1, hasMore: false, total: 1 };
  }

  const limit = Math.min(Math.max(query.limit, 1), 32);
  const offset = Math.max(query.page - 1, 0) * limit;
  const trimmed = query.query?.trim() ?? "";
  const titleParam = trimmed ? `title=${encodeURIComponent(trimmed)}&` : "";
  const tagParam = query.categoryId
    ? `includedTags[]=${encodeURIComponent(query.categoryId)}&`
    : "";

  const res = await mangadexFetch(
    `/manga?${titleParam}${tagParam}limit=${limit}&offset=${offset}&${orderQuery(query.sort, Boolean(trimmed))}&${INCLUDES}&${contentRatingQuery(query.hideAdult)}`,
    { revalidate: 300 },
  );
  const json = (await res.json()) as {
    data?: MangaData[];
    total?: number;
  };
  const items = (json.data ?? [])
    .map(mapCandidate)
    .filter((candidate) => !(query.hideAdult && candidate.isAdult));
  const total = json.total;
  const hasMore =
    total != null ? offset + (json.data?.length ?? 0) < total : items.length >= limit;

  return { items, page: query.page, hasMore, total };
}

export async function mangaDexCategories(
  hideAdult = true,
): Promise<SourceCategory[]> {
  const res = await mangadexFetch("/manga/tag", { revalidate: 86400 });
  const json = (await res.json()) as {
    data?: {
      id: string;
      attributes?: { name?: Record<string, string>; group?: string };
    }[];
  };

  return (json.data ?? [])
    .filter((tag) => tag.attributes?.group === "genre")
    .map((tag) => ({
      id: tag.id,
      name: localizedTitle(tag.attributes?.name),
    }))
    .filter((tag) => tag.name && !(hideAdult && hasAdultGenre([tag.name])))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Titles matching `query`. An empty query browses the most followed titles, and
 * a UUID or mangadex.org URL resolves that single title.
 */
export async function searchMangaDexCatalog(
  query: string,
  limit = 24,
): Promise<MangaDexCandidate[]> {
  const page = await browseMangaDex({
    sort: "popular",
    query,
    page: 1,
    limit,
    hideAdult: false,
  });
  return page.items as MangaDexCandidate[];
}

export type { ImportOutcome } from "@/lib/sources/import-title";

/** Adds a MangaDex title to the catalog, refreshing it when already present. */
export async function importMangaDexTitle(
  mangaId: string,
  sourceName: string,
  extras?: Pick<ImportExtras, "mode" | "migrateBookId" | "sourceKey">,
): Promise<ImportOutcome> {
  const candidate = mapCandidate(await fetchMangaById(mangaId));
  if (!candidate.coverUrl) {
    throw new Error(`${candidate.title}: no cover art on MangaDex`);
  }

  const sync = await fetchMangaDexByUrl(candidate.url).catch(() => null);
  const totalPages =
    sync?.totalPages ??
    Math.max(Math.round(Number.parseFloat(candidate.lastChapter ?? "1")) || 1, 1);

  return importCatalogCandidate(candidate, sourceName, {
    totalPages,
    externalId: candidate.anilistId ? `anilist:${candidate.anilistId}` : null,
    publicationStatus: sync?.publicationStatus,
    mode: extras?.mode,
    migrateBookId: extras?.migrateBookId,
    sourceKey: extras?.sourceKey ?? "mangadex",
  });
}

/** MangaDex ids already present in the catalog, for marking search results. */
export async function existingMangaDexUrls(
  candidates: MangaDexCandidate[],
): Promise<Set<string>> {
  if (candidates.length === 0) return new Set();

  const books = await prisma.book.findMany({
    where: { sourceUrl: { in: candidates.map((candidate) => candidate.url) } },
    select: { sourceUrl: true },
  });

  return new Set(
    books
      .map((book) => book.sourceUrl)
      .filter((url): url is string => url != null),
  );
}
