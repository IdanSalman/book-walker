import { prisma } from "@/lib/prisma";
import {
  READING_ENGINES,
  sourceEngine,
} from "@/lib/reader/resolve";
import {
  engineMatchesName,
  engineMatchesUrl,
  type ReaderSourceEngine,
} from "@/lib/reader/source-engine";
import { normalizeTitle, titlesMatch } from "@/lib/reader/source-id";
import type { CatalogCandidate, ReaderChapter } from "@/lib/reader/types";
import { getBrowsableSources } from "@/lib/sources/browsable";

export type MigrationSource = {
  key: string;
  name: string;
};

export type MigrationCandidate = {
  sourceKey: string;
  sourceName: string;
  id: string;
  title: string;
  coverUrl: string | null;
  lastChapter: string | null;
  author: string | null;
  url: string;
};

export type MigrationPreviewChapter = {
  name: string;
  scanlationGroup: string | null;
  publishedAt: string | null;
  pageCount: number;
};

export type MigrationPreview = {
  sourceKey: string;
  sourceName: string;
  id: string;
  title: string;
  summary: string;
  coverUrl: string | null;
  publicationStatus: CatalogCandidate["publicationStatus"];
  year: number | null;
  genres: string[];
  isAdult: boolean;
  author: string | null;
  artist: string | null;
  lastChapter: string | null;
  url: string;
  chapterCount: number;
  latestChapters: MigrationPreviewChapter[];
  chaptersError: string | null;
};

const LATEST_CHAPTERS = 12;

const RESULTS_PER_SOURCE = 8;

export function candidateMatchScore(query: string, title: string): number {
  if (titlesMatch(query, title)) return 3;
  const needle = normalizeTitle(query);
  const haystack = normalizeTitle(title);
  if (!needle || !haystack) return 0;
  if (haystack.startsWith(needle) || needle.startsWith(haystack)) return 2;
  if (haystack.includes(needle) || needle.includes(haystack)) return 1;
  return 0;
}

function uniqueSources(sources: MigrationSource[]): MigrationSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.key)) return false;
    seen.add(source.key);
    return true;
  });
}

function currentEngineKeys(book: {
  sourceName: string | null;
  sourceUrl: string | null;
}): Set<string> {
  const keys = new Set<string>();
  for (const engine of READING_ENGINES) {
    if (
      engineMatchesName(engine, book.sourceName) ||
      engineMatchesUrl(engine, book.sourceUrl)
    ) {
      keys.add(engine.key);
    }
  }
  return keys;
}

export async function listMigrationSources(book: {
  sourceName: string | null;
  sourceUrl: string | null;
}): Promise<MigrationSource[]> {
  const sources = await getBrowsableSources();
  const current = currentEngineKeys(book);
  const others = sources.filter((source) => !current.has(source.key));
  return uniqueSources(others.length > 0 ? others : sources);
}

export async function searchMigrationCandidates(opts: {
  book: {
    title: string;
    sourceUrl: string | null;
    sourceName: string | null;
  };
  query: string;
  sourceKey?: string;
}): Promise<MigrationCandidate[]> {
  const query = opts.query.trim();
  if (!query) return [];

  const destinations = await listMigrationSources(opts.book);
  const selected = opts.sourceKey
    ? destinations.filter((source) => source.key === opts.sourceKey)
    : destinations;
  if (selected.length === 0) return [];

  const groups = await Promise.all(
    selected.map(async (source) => {
      const engine = await sourceEngine(source.key);
      if (!engine) return [] as MigrationCandidate[];
      try {
        const hits = await engine.search(query);
        return rankCandidates(query, hits)
          .filter((hit) => hit.url !== opts.book.sourceUrl)
          .slice(0, RESULTS_PER_SOURCE)
          .map((hit) => ({
            sourceKey: source.key,
            sourceName: source.name,
            id: hit.id,
            title: hit.title,
            coverUrl: hit.coverUrl,
            lastChapter: hit.lastChapter,
            author: hit.author,
            url: hit.url,
          }));
      } catch {
        return [] as MigrationCandidate[];
      }
    }),
  );

  return groups.flat().sort((left, right) => {
    const score =
      candidateMatchScore(query, right.title) -
      candidateMatchScore(query, left.title);
    if (score !== 0) return score;
    return left.sourceName.localeCompare(right.sourceName);
  });
}

function rankCandidates(
  query: string,
  hits: CatalogCandidate[],
): CatalogCandidate[] {
  return [...hits].sort(
    (left, right) =>
      candidateMatchScore(query, right.title) -
      candidateMatchScore(query, left.title),
  );
}

export async function loadBookForMigration(bookId: string) {
  return prisma.book.findUnique({
    where: { id: bookId },
    select: {
      id: true,
      title: true,
      sourceName: true,
      sourceUrl: true,
    },
  });
}

export async function previewMigrationTarget(
  sourceKey: string,
  titleId: string,
  hint?: Pick<MigrationCandidate, "title" | "url">,
): Promise<MigrationPreview> {
  const engine = await sourceEngine(sourceKey);
  if (!engine) throw new Error("Unknown source");

  const [listingResult, chaptersResult] = await Promise.allSettled([
    loadListing(engine, titleId),
    engine.resolveManga({
      title: hint?.title ?? titleId,
      sourceUrl: hint?.url ?? null,
      externalId: engine.key === "comick" ? titleId : null,
      sourceName: engine.name,
    }),
  ]);

  if (listingResult.status === "rejected") {
    throw listingResult.reason instanceof Error
      ? listingResult.reason
      : new Error("Title not found");
  }

  const listing = listingResult.value;
  let chapterCount = 0;
  let latestChapters: MigrationPreviewChapter[] = [];
  let chaptersError: string | null = null;

  if (chaptersResult.status === "fulfilled") {
    chapterCount = chaptersResult.value.chapters.length;
    latestChapters = newestChapters(
      chaptersResult.value.chapters,
      LATEST_CHAPTERS,
    );
  } else {
    chaptersError =
      chaptersResult.reason instanceof Error
        ? chaptersResult.reason.message
        : "Chapters could not be loaded.";
  }

  return {
    sourceKey: engine.key,
    sourceName: engine.name,
    id: listing.id,
    title: listing.title,
    summary: listing.summary,
    coverUrl: listing.coverUrl,
    publicationStatus: listing.publicationStatus,
    year: listing.year,
    genres: listing.genres,
    isAdult: listing.isAdult,
    author: listing.author,
    artist: listing.artist,
    lastChapter: listing.lastChapter,
    url: listing.url,
    chapterCount,
    latestChapters,
    chaptersError,
  };
}

async function loadListing(
  engine: ReaderSourceEngine,
  titleId: string,
): Promise<CatalogCandidate> {
  if (engine.getById) return engine.getById(titleId);
  const found = (await engine.search(titleId))[0];
  if (!found) throw new Error("Title not found");
  return found;
}

function newestChapters(
  chapters: ReaderChapter[],
  limit: number,
): MigrationPreviewChapter[] {
  return [...chapters]
    .reverse()
    .slice(0, limit)
    .map((chapter) => ({
      name: chapter.name,
      scanlationGroup: chapter.scanlationGroup,
      publishedAt: chapter.publishedAt,
      pageCount: chapter.pageCount,
    }));
}
