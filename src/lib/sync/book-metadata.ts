import type { BookCategory, PublicationStatus } from "@prisma/client";

import { mangadexFetch } from "@/lib/mangadex-api";
import {
  isMangaDexUrl,
  mangaDexIdFromUrl,
  normalizeMangaDexUrl,
} from "@/lib/publication";
import { latestChapterNumber } from "@/lib/reader/chapter-progress";
import type { ReaderBookRef } from "@/lib/reader/source-engine";
import { isReadingSourceUrl } from "@/lib/reader/source-link";

const ANILIST_URL = "https://graphql.anilist.co";

export type SyncResult = {
  totalPages: number;
  publicationStatus: PublicationStatus;
  sourceUrl?: string;
  sourceName?: string;
  externalId?: string;
  lastSyncedAt: Date;
  syncedFrom?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapAnilistStatus(status: string | null | undefined): PublicationStatus {
  switch (status) {
    case "RELEASING":
      return "ONGOING";
    case "FINISHED":
      return "COMPLETED";
    case "HIATUS":
      return "HIATUS";
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "UNKNOWN";
  }
}

function mapMangaDexStatus(status: string | null | undefined): PublicationStatus {
  switch (status?.toLowerCase()) {
    case "ongoing":
      return "ONGOING";
    case "completed":
      return "COMPLETED";
    case "hiatus":
      return "HIATUS";
    case "cancelled":
      return "CANCELLED";
    default:
      return "UNKNOWN";
  }
}

function mapTachiyomiStatus(status: number | null | undefined): PublicationStatus {
  switch (status) {
    case 1:
      return "ONGOING";
    case 2:
    case 3:
    case 4:
      return "COMPLETED";
    case 5:
      return "CANCELLED";
    case 6:
      return "HIATUS";
    default:
      return "UNKNOWN";
  }
}

export { mapAnilistStatus, mapMangaDexStatus, mapTachiyomiStatus };

async function anilistQuery(
  query: string,
  variables: Record<string, unknown>,
  attempt = 0,
): Promise<unknown> {
  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 429) {
    if (attempt >= 6) throw new Error("AniList rate limit exceeded");
    await sleep(2000 * 2 ** attempt);
    return anilistQuery(query, variables, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`AniList HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    errors?: { message: string }[];
    data?: unknown;
  };
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  return json.data;
}

type AnilistMedia = {
  id: number;
  status: string;
  chapters: number | null;
  volumes: number | null;
};

export async function fetchAnilistById(anilistId: number): Promise<SyncResult> {
  const data = (await anilistQuery(
    `query ($id: Int) {
      Media(id: $id, type: MANGA) {
        id
        status
        chapters
        volumes
      }
    }`,
    { id: anilistId },
  )) as { Media: AnilistMedia | null };

  const media = data.Media;
  if (!media) {
    throw new Error("Title not found on AniList");
  }

  const publicationStatus = mapAnilistStatus(media.status);
  const totalPages = Math.max(media.chapters ?? media.volumes ?? 1, 1);

  return {
    totalPages,
    publicationStatus,
    externalId: `anilist:${media.id}`,
    sourceUrl: `https://anilist.co/manga/${media.id}`,
    lastSyncedAt: new Date(),
    syncedFrom: "AniList",
  };
}

export async function searchAnilistByTitle(
  title: string,
): Promise<SyncResult | null> {
  const data = (await anilistQuery(
    `query ($search: String) {
      Page(perPage: 5) {
        media(search: $search, type: MANGA, isAdult: false) {
          id
          status
          chapters
          volumes
          title { english romaji native }
        }
      }
    }`,
    { search: title },
  )) as {
    Page: {
      media: (AnilistMedia & {
        title: { english: string | null; romaji: string | null; native: string | null };
      })[];
    };
  };

  const normalized = title.trim().toLowerCase();
  const match = data.Page.media.find((m) => {
    const candidates = [m.title.english, m.title.romaji, m.title.native]
      .filter(Boolean)
      .map((t) => t!.toLowerCase());
    return candidates.includes(normalized);
  }) ?? data.Page.media[0];

  if (!match) return null;

  const publicationStatus = mapAnilistStatus(match.status);
  const totalPages = Math.max(match.chapters ?? match.volumes ?? 1, 1);

  return {
    totalPages,
    publicationStatus,
    externalId: `anilist:${match.id}`,
    sourceUrl: `https://anilist.co/manga/${match.id}`,
    lastSyncedAt: new Date(),
    syncedFrom: "AniList",
  };
}

export async function fetchMangaDexByUrl(sourceUrl: string): Promise<SyncResult> {
  const mangaId = mangaDexIdFromUrl(sourceUrl);
  if (!mangaId) {
    throw new Error("Invalid MangaDex URL");
  }

  const normalizedUrl = normalizeMangaDexUrl(sourceUrl) ?? sourceUrl;

  const [mangaRes, statsRes] = await Promise.all([
    mangadexFetch(`/manga/${mangaId}`, { revalidate: false }),
    mangadexFetch(`/statistics/manga/${mangaId}`, { revalidate: false }).catch(
      () => null,
    ),
  ]);

  const mangaJson = (await mangaRes.json()) as {
    data?: { attributes?: { status?: string } };
  };
  const attributes = mangaJson.data?.attributes;
  if (!attributes) {
    throw new Error("MangaDex title not found");
  }

  let totalPages = 1;
  if (statsRes) {
    const statsJson = (await statsRes.json()) as {
      chapters?: { total?: number };
    };
    if (statsJson.chapters?.total && statsJson.chapters.total > 0) {
      totalPages = statsJson.chapters.total;
    }
  }

  if (totalPages <= 1) {
    const feedRes = await mangadexFetch(
      `/manga/${mangaId}/feed?translatedLanguage[]=en&limit=0&order[chapter]=desc`,
      { revalidate: false },
    );
    const feedJson = (await feedRes.json()) as { total?: number };
    if (feedJson.total && feedJson.total > 0) {
      totalPages = feedJson.total;
    }
  }

  return {
    totalPages: Math.max(totalPages, 1),
    publicationStatus: mapMangaDexStatus(attributes.status),
    sourceUrl: normalizedUrl,
    lastSyncedAt: new Date(),
    syncedFrom: "MangaDex",
  };
}

export async function syncBookMetadata(book: {
  title: string;
  category?: BookCategory;
  externalId: string | null;
  sourceUrl: string | null;
  sourceName?: string | null;
  publicationStatus?: PublicationStatus;
}): Promise<SyncResult> {
  const fromSource = await syncFromCurrentSource(book);
  if (fromSource) return fromSource;

  if (book.category === "BOOK") {
    throw new Error(
      "No Open Library / Internet Archive scan is configured for this book.",
    );
  }

  if (book.externalId?.startsWith("anilist:")) {
    const id = Number(book.externalId.slice("anilist:".length));
    if (!Number.isFinite(id)) {
      throw new Error("Invalid AniList external ID");
    }
    return keepReadingSourceUrl(book, await fetchAnilistById(id));
  }

  if (book.sourceUrl && isMangaDexUrl(book.sourceUrl)) {
    return fetchMangaDexByUrl(book.sourceUrl);
  }

  const fromSearch = await searchAnilistByTitle(book.title);
  if (fromSearch) return keepReadingSourceUrl(book, fromSearch);

  throw new Error(
    "No sync source configured. Set a reading source, AniList external ID, or MangaDex URL.",
  );
}

async function syncFromCurrentSource(
  book: ReaderBookRef & { publicationStatus?: PublicationStatus },
): Promise<SyncResult | null> {
  const { currentReadingEngine } = await import("@/lib/reader/resolve");
  const engine = await currentReadingEngine(book);
  if (!engine) return null;

  try {
    const resolved = await engine.resolveManga(book);
    if (resolved.chapters.length === 0) return null;
    return {
      totalPages: latestChapterNumber(resolved.chapters),
      publicationStatus: book.publicationStatus ?? "UNKNOWN",
      sourceUrl: resolved.sourceUrl ?? book.sourceUrl ?? undefined,
      sourceName: resolved.sourceName ?? engine.name,
      lastSyncedAt: new Date(),
      syncedFrom: resolved.sourceName || engine.name,
    };
  } catch {
    return null;
  }
}

function keepReadingSourceUrl(
  book: { sourceUrl: string | null },
  result: SyncResult,
): SyncResult {
  if (!isReadingSourceUrl(book.sourceUrl)) return result;
  return {
    ...result,
    sourceUrl: undefined,
  };
}
