import type { BookCategory } from "@prisma/client";

import { coverImageLoads } from "@/lib/cover-validation";
import { prisma } from "@/lib/prisma";
import {
  BOOK_READING_ENGINES,
  READING_ENGINES,
} from "@/lib/reader/resolve";
import { isReadingSourceUrl } from "@/lib/reader/source-link";
import {
  engineMatchesName,
  engineMatchesUrl,
  type ReaderSourceEngine,
} from "@/lib/reader/source-engine";
import { normalizeTitle, titlesMatch } from "@/lib/reader/source-id";
import type { CatalogCandidate, ResolvedManga } from "@/lib/reader/types";
import { findGoogleBooksCover } from "@/lib/sources/google-books-cover";

export const COVER_REPAIR_LIMIT = 15;

export type CoverHit = {
  coverUrl: string;
  sourceKey: string;
  sourceName: string;
  url: string;
  author?: string | null;
  summary?: string | null;
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
  category: BookCategory;
  coverUrl: string;
  coverCorrupted: boolean;
  sourceName: string | null;
  sourceUrl: string | null;
  author?: string | null;
};

function needsCoverRepair(book: BookCoverRef): boolean {
  return (
    book.coverCorrupted ||
    !book.coverUrl.trim() ||
    !storedSourceFitsCategory(book)
  );
}

function titleRelevance(candidate: string, title: string): number {
  if (titlesMatch(candidate, title)) return 3;
  const needle = normalizeTitle(title);
  const haystack = normalizeTitle(candidate);
  if (!needle || !haystack) return 0;
  if (haystack === needle || haystack.startsWith(`${needle} `) || needle.startsWith(`${haystack} `)) {
    return 2;
  }
  if (haystack.includes(needle) || needle.includes(haystack)) return 1;
  return 0;
}

function pickCoverHit(
  hits: CatalogCandidate[],
  title: string,
): CatalogCandidate | undefined {
  const withCover = hits.filter((hit) => hit.coverUrl?.trim());
  const ranked = [...withCover].sort(
    (left, right) => titleRelevance(right.title, title) - titleRelevance(left.title, title),
  );
  const best = ranked[0];
  if (!best || titleRelevance(best.title, title) === 0) {
    return undefined;
  }
  return best;
}

function engineMatches(
  engine: ReaderSourceEngine,
  book: Pick<BookCoverRef, "sourceName" | "sourceUrl">,
): boolean {
  return (
    engineMatchesUrl(engine, book.sourceUrl) ||
    engineMatchesName(engine, book.sourceName)
  );
}

function comicEngineFor(
  book: Pick<BookCoverRef, "sourceName" | "sourceUrl">,
): ReaderSourceEngine | undefined {
  return READING_ENGINES.find((engine) => engineMatches(engine, book));
}

function bookEngineFor(
  book: Pick<BookCoverRef, "sourceName" | "sourceUrl">,
): ReaderSourceEngine | undefined {
  return BOOK_READING_ENGINES.find((engine) => engineMatches(engine, book));
}

/** False when a comic site is stored on a print book, or Open Library on a manga. */
export function storedSourceFitsCategory(
  book: Pick<BookCoverRef, "category" | "sourceName" | "sourceUrl">,
): boolean {
  const hasSource = Boolean(book.sourceName?.trim() || book.sourceUrl?.trim());
  if (!hasSource) return true;

  const comic = comicEngineFor(book);
  const print = bookEngineFor(book);

  if (book.category === "BOOK") return Boolean(print) && !comic;
  if (book.category === "MANGA") return Boolean(comic) && !print;
  return !print;
}

function enginePoolForCategory(category: BookCategory): ReaderSourceEngine[] {
  if (category === "BOOK") {
    return BOOK_READING_ENGINES.filter((engine) => engine.key !== "localpdf");
  }
  if (category === "LIGHT_NOVEL") return [];
  return READING_ENGINES;
}

export function enginesForBook(
  book: Pick<BookCoverRef, "category" | "sourceName" | "sourceUrl">,
): ReaderSourceEngine[] {
  const pool = enginePoolForCategory(book.category);
  if (book.category === "LIGHT_NOVEL") {
    return READING_ENGINES.filter((engine) => engineMatches(engine, book));
  }

  const preferred: ReaderSourceEngine[] = [];
  const rest: ReaderSourceEngine[] = [];
  for (const engine of pool) {
    if (engineMatches(engine, book)) preferred.push(engine);
    else rest.push(engine);
  }
  return [...preferred, ...rest];
}

async function searchEnginesForCover(
  title: string,
  engines: ReaderSourceEngine[],
  options?: { allowLooseComick?: boolean; author?: string | null },
): Promise<CoverHit | null> {
  const query = [title, options?.author?.trim()].filter(Boolean).join(" ");
  for (const engine of engines) {
    try {
      const hits = await engine.search(query);
      const match =
        pickCoverHit(hits, title) ??
        (options?.allowLooseComick && engine.key === "comick"
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

export async function findCoverFromSources(
  title: string,
  options?: {
    excludeKey?: string;
    category?: BookCategory;
    author?: string | null;
  },
): Promise<CoverHit | null> {
  const category = options?.category ?? "MANGA";
  const engines = enginePoolForCategory(category).filter(
    (engine) => engine.key !== options?.excludeKey,
  );
  const hit = await searchEnginesForCover(title, engines, {
    allowLooseComick: category === "MANGA",
    author: options?.author,
  });
  if (hit) return hit;
  if (category === "BOOK") {
    return findGoogleBooksCover(title, options?.author);
  }
  return null;
}

export async function withCoverFromSources(
  candidate: CatalogCandidate,
  excludeKey?: string,
  category: BookCategory = "MANGA",
): Promise<CatalogCandidate> {
  if (candidate.coverUrl?.trim()) return candidate;
  const hit = await findCoverFromSources(candidate.title, {
    excludeKey,
    category,
  });
  if (!hit) return candidate;
  return { ...candidate, coverUrl: hit.coverUrl };
}

export async function repairBookCover(
  book: BookCoverRef,
): Promise<CoverRepairOutcome> {
  const sourceWrong = !storedSourceFitsCategory(book);
  const coverWorks =
    Boolean(book.coverUrl.trim()) && (await coverImageLoads(book.coverUrl));

  if (coverWorks && !sourceWrong) {
    if (book.coverCorrupted) {
      await prisma.book.update({
        where: { id: book.id },
        data: { coverCorrupted: false },
      });
    }
    return { repaired: false, reloaded: true, sourceAssigned: false };
  }

  const hit =
    (await searchEnginesForCover(book.title, enginesForBook(book), {
      allowLooseComick: book.category === "MANGA",
      author: book.author,
    })) ??
    (book.category === "BOOK"
      ? await findGoogleBooksCover(book.title, book.author)
      : null);

  if (!hit) {
    if (sourceWrong) {
      await prisma.book.update({
        where: { id: book.id },
        data: { sourceName: null, sourceUrl: null },
      });
      return {
        repaired: false,
        reloaded: false,
        sourceAssigned: false,
        error:
          "Cleared the mismatched comic source. No book catalog had a working cover for this title",
      };
    }
    return {
      repaired: false,
      reloaded: false,
      sourceAssigned: false,
      error: "No source had a working cover for this title",
    };
  }

  const hasCategoryEngine =
    book.category === "BOOK"
      ? Boolean(bookEngineFor(book))
      : Boolean(comicEngineFor(book));
  const assignSource = sourceWrong || !hasCategoryEngine;

  await prisma.book.update({
    where: { id: book.id },
    data: {
      coverUrl: hit.coverUrl,
      coverCorrupted: false,
      ...(assignSource
        ? { sourceName: hit.sourceName, sourceUrl: hit.url }
        : {}),
      ...(book.author?.trim()
        ? {}
        : hit.author
          ? { author: hit.author }
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

  const sourceWrong = !storedSourceFitsCategory(book);
  const resolvedCover = resolved.coverUrl?.trim();
  const existingCover = book.coverUrl.trim();
  const existingWorks =
    Boolean(existingCover) &&
    !book.coverCorrupted &&
    !sourceWrong &&
    (await coverImageLoads(existingCover));
  if (resolvedCover && !existingWorks) {
    data.coverUrl = resolvedCover;
    data.coverCorrupted = false;
  }

  if (
    resolved.sourceUrl &&
    isReadingSourceUrl(resolved.sourceUrl) &&
    enginesForBook(book).some(
      (engine) =>
        engineMatchesUrl(engine, resolved.sourceUrl) ||
        engineMatchesName(engine, resolved.sourceName),
    ) &&
    (sourceWrong || !isReadingSourceUrl(book.sourceUrl))
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
  const comicSourceClause = {
    category: "BOOK" as const,
    OR: READING_ENGINES.flatMap((engine) => [
      { sourceName: { equals: engine.name, mode: "insensitive" as const } },
      { sourceName: { equals: engine.key, mode: "insensitive" as const } },
      ...engine.hosts.map((host) => ({
        sourceUrl: { contains: host, mode: "insensitive" as const },
      })),
    ]),
  };

  const books = await prisma.book.findMany({
    where: {
      OR: [{ coverCorrupted: true }, { coverUrl: "" }, comicSourceClause],
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: {
      id: true,
      title: true,
      category: true,
      coverUrl: true,
      coverCorrupted: true,
      sourceName: true,
      sourceUrl: true,
      author: true,
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
