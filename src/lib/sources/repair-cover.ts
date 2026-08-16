import { coverImageLoads } from "@/lib/cover-validation";
import { prisma } from "@/lib/prisma";
import { READING_ENGINES } from "@/lib/reader/resolve";
import { isReadingSourceUrl } from "@/lib/reader/source-link";
import {
  engineMatchesName,
  engineMatchesUrl,
  type ReaderSourceEngine,
} from "@/lib/reader/source-engine";
import { normalizeTitle, titlesMatch } from "@/lib/reader/source-id";
import type { CatalogCandidate, ResolvedManga } from "@/lib/reader/types";

export const COVER_REPAIR_LIMIT = 15;

export type CoverHit = {
  coverUrl: string;
  sourceKey: string;
  sourceName: string;
  url: string;
};

export type CoverRepairOutcome = {
  repaired: boolean;
  reloaded: boolean;
  sourceAssigned: boolean;
  coverUrl?: string;
  sourceName?: string;
  error?: string;
};

type BookCoverRef = {
  id: string;
  title: string;
  coverUrl: string;
  coverCorrupted: boolean;
  sourceName: string | null;
  sourceUrl: string | null;
};

function needsCoverRepair(book: BookCoverRef): boolean {
  return book.coverCorrupted || !book.coverUrl.trim();
}

function pickCoverHit(
  hits: CatalogCandidate[],
  title: string,
): CatalogCandidate | undefined {
  const withCover = hits.filter((hit) => hit.coverUrl?.trim());
  const exact = withCover.find((hit) => titlesMatch(hit.title, title));
  if (exact) return exact;

  const needle = normalizeTitle(title);
  if (needle.length < 8) return withCover.length === 1 ? withCover[0] : undefined;

  return withCover.find((hit) => {
    const candidate = normalizeTitle(hit.title);
    return candidate.includes(needle) || needle.includes(candidate);
  });
}

function enginesForBook(book: Pick<BookCoverRef, "sourceName" | "sourceUrl">) {
  const preferred: ReaderSourceEngine[] = [];
  const rest: ReaderSourceEngine[] = [];
  for (const engine of READING_ENGINES) {
    if (
      engineMatchesUrl(engine, book.sourceUrl) ||
      engineMatchesName(engine, book.sourceName)
    ) {
      preferred.push(engine);
    } else {
      rest.push(engine);
    }
  }
  return [...preferred, ...rest];
}

export async function findCoverFromSources(
  title: string,
  options?: { excludeKey?: string },
): Promise<CoverHit | null> {
  const engines = READING_ENGINES.filter(
    (engine) => engine.key !== options?.excludeKey,
  );
  return searchEnginesForCover(title, engines);
}

async function searchEnginesForCover(
  title: string,
  engines: ReaderSourceEngine[],
): Promise<CoverHit | null> {
  for (const engine of engines) {
    try {
      const hits = await engine.search(title);
      const match =
        pickCoverHit(hits, title) ??
        (engine.key === "comick"
          ? hits.find((hit) => hit.coverUrl?.trim())
          : undefined);
      const coverUrl = match?.coverUrl?.trim();
      if (!match || !coverUrl) continue;
      if (!(await coverImageLoads(coverUrl))) continue;
      return {
        coverUrl,
        sourceKey: engine.key,
        sourceName: engine.name,
        url: match.url,
      };
    } catch {
      /* try the next source */
    }
  }
  return null;
}

export async function withCoverFromSources(
  candidate: CatalogCandidate,
  excludeKey?: string,
): Promise<CatalogCandidate> {
  if (candidate.coverUrl?.trim()) return candidate;
  const hit = await findCoverFromSources(candidate.title, { excludeKey });
  if (!hit) return candidate;
  return { ...candidate, coverUrl: hit.coverUrl };
}

export async function repairBookCover(
  book: BookCoverRef,
): Promise<CoverRepairOutcome> {
  if (book.coverUrl.trim() && (await coverImageLoads(book.coverUrl))) {
    if (book.coverCorrupted) {
      await prisma.book.update({
        where: { id: book.id },
        data: { coverCorrupted: false },
      });
    }
    return { repaired: false, reloaded: true, sourceAssigned: false };
  }

  const hit = await searchEnginesForCover(book.title, enginesForBook(book));
  if (!hit) {
    return {
      repaired: false,
      reloaded: false,
      sourceAssigned: false,
      error: "No source had a working cover for this title",
    };
  }

  const assignSource =
    !book.sourceName?.trim() || !isReadingSourceUrl(book.sourceUrl);
  await prisma.book.update({
    where: { id: book.id },
    data: {
      coverUrl: hit.coverUrl,
      coverCorrupted: false,
      ...(assignSource
        ? { sourceName: hit.sourceName, sourceUrl: hit.url }
        : {}),
    },
  });

  return {
    repaired: true,
    reloaded: true,
    sourceAssigned: assignSource,
    coverUrl: hit.coverUrl,
    sourceName: hit.sourceName,
  };
}

export async function applyResolvedListing(
  book: BookCoverRef,
  resolved: Pick<ResolvedManga, "sourceName" | "sourceUrl" | "coverUrl">,
): Promise<boolean> {
  const data: {
    coverUrl?: string;
    coverCorrupted?: boolean;
    sourceName?: string;
    sourceUrl?: string;
  } = {};

  const resolvedCover = resolved.coverUrl?.trim();
  const existingCover = book.coverUrl.trim();
  const existingWorks =
    Boolean(existingCover) &&
    !book.coverCorrupted &&
    (await coverImageLoads(existingCover));
  if (resolvedCover && !existingWorks) {
    data.coverUrl = resolvedCover;
    data.coverCorrupted = false;
  }

  if (
    resolved.sourceUrl &&
    isReadingSourceUrl(resolved.sourceUrl) &&
    !isReadingSourceUrl(book.sourceUrl)
  ) {
    data.sourceUrl = resolved.sourceUrl;
    data.sourceName = resolved.sourceName;
  }

  if (Object.keys(data).length === 0) return false;

  await prisma.book.update({
    where: { id: book.id },
    data,
  });
  return true;
}

export async function repairMissingCovers(limit = COVER_REPAIR_LIMIT): Promise<{
  repaired: number;
  reloaded: number;
  assigned: number;
  failed: number;
  scanned: number;
}> {
  const books = await prisma.book.findMany({
    where: {
      OR: [{ coverCorrupted: true }, { coverUrl: "" }],
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: {
      id: true,
      title: true,
      coverUrl: true,
      coverCorrupted: true,
      sourceName: true,
      sourceUrl: true,
    },
  });

  let repaired = 0;
  let reloaded = 0;
  let assigned = 0;
  let failed = 0;

  for (const book of books.filter(needsCoverRepair)) {
    try {
      const outcome = await repairBookCover(book);
      if (outcome.repaired) repaired += 1;
      else if (outcome.reloaded) reloaded += 1;
      if (outcome.sourceAssigned) assigned += 1;
      if (!outcome.repaired && !outcome.reloaded) failed += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    repaired,
    reloaded,
    assigned,
    failed,
    scanned: books.length,
  };
}
