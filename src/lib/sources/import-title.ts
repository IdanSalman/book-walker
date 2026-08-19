import type { BookCategory, PublicationStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { READING_ENGINES } from "@/lib/reader/resolve";
import {
  engineMatchesName,
  engineMatchesUrl,
} from "@/lib/reader/source-engine";
import { titlesMatch } from "@/lib/reader/source-id";
import type { CatalogCandidate } from "@/lib/reader/types";
import { catalogCategoryForCandidate } from "@/lib/sources/catalog-kind";
import {
  equivalentListingUrls,
  listingsMatch,
} from "@/lib/sources/listing-url";

export type ImportOutcome = {
  id: string;
  title: string;
  status: "created" | "updated" | "migrated";
};

export type ImportMode = "migrate" | "duplicate";

export type CatalogConflict = {
  id: string;
  title: string;
  category?: BookCategory;
  sourceName: string | null;
  sourceUrl: string | null;
};

export type ImportExtras = {
  totalPages?: number;
  externalId?: string | null;
  publicationStatus?: PublicationStatus;
  mode?: ImportMode;
  migrateBookId?: string;
  category?: BookCategory;
  sourceKey?: string;
};

export class CatalogConflictError extends Error {
  readonly existing: CatalogConflict[];
  readonly candidateTitle: string;
  readonly incomingSourceName: string;

  constructor(opts: {
    candidateTitle: string;
    incomingSourceName: string;
    existing: CatalogConflict[];
  }) {
    const from = opts.existing[0]?.sourceName?.trim() || "another source";
    super(`${opts.candidateTitle} is already in the store from ${from}.`);
    this.name = "CatalogConflictError";
    this.existing = opts.existing;
    this.candidateTitle = opts.candidateTitle;
    this.incomingSourceName = opts.incomingSourceName;
  }
}

export function isCatalogConflictError(
  error: unknown,
): error is CatalogConflictError {
  return error instanceof CatalogConflictError;
}

const conflictSelect = {
  id: true,
  title: true,
  category: true,
  sourceName: true,
  sourceUrl: true,
} as const;

export async function catalogBooksByUrls(
  urls: string[],
): Promise<Map<string, CatalogConflict>> {
  if (urls.length === 0) return new Map();
  const lookup = [...new Set(urls.flatMap((url) => equivalentListingUrls(url)))];
  const books = await prisma.book.findMany({
    where: { sourceUrl: { in: lookup } },
    select: conflictSelect,
  });
  const map = new Map<string, CatalogConflict>();
  for (const url of urls) {
    const book =
      books.find((row) => row.sourceUrl === url) ??
      books.find((row) => listingsMatch(row.sourceUrl, url));
    if (book) map.set(url, book);
  }
  return map;
}

export async function existingCatalogUrls(
  urls: string[],
): Promise<Set<string>> {
  return new Set((await catalogBooksByUrls(urls)).keys());
}

export async function catalogBooksByTitles(
  titles: string[],
  category?: BookCategory,
): Promise<CatalogConflict[]> {
  const unique = [
    ...new Set(titles.map((title) => title.trim()).filter(Boolean)),
  ];
  if (unique.length === 0) return [];
  return prisma.book.findMany({
    where: {
      ...(category ? { category } : {}),
      OR: unique.map((title) => ({
        title: { equals: title, mode: "insensitive" as const },
      })),
    },
    select: conflictSelect,
  });
}

function isSameSourceListing(
  candidateUrl: string,
  book: CatalogConflict,
): boolean {
  const engine = READING_ENGINES.find((item) =>
    engineMatchesUrl(item, candidateUrl),
  );
  if (!engine) return false;
  return (
    engineMatchesUrl(engine, book.sourceUrl) ||
    engineMatchesName(engine, book.sourceName)
  );
}

export function isSameCatalogListing(
  candidate: Pick<CatalogCandidate, "title" | "url">,
  book: CatalogConflict,
): boolean {
  if (listingsMatch(book.sourceUrl, candidate.url)) return true;
  return (
    titlesMatch(book.title, candidate.title) &&
    isSameSourceListing(candidate.url, book)
  );
}

export async function findExistingForCandidate(
  candidate: Pick<CatalogCandidate, "title" | "url">,
  category: BookCategory,
): Promise<{
  sameListing: CatalogConflict | null;
  sameTitle: CatalogConflict[];
}> {
  const books = await prisma.book.findMany({
    where: {
      OR: [
        { sourceUrl: { in: equivalentListingUrls(candidate.url) } },
        {
          title: { equals: candidate.title, mode: "insensitive" },
          category,
        },
      ],
    },
    select: conflictSelect,
  });
  const sameListing =
    books.find((book) => isSameCatalogListing(candidate, book)) ?? null;
  const sameTitle = books.filter(
    (book) => book.id !== sameListing?.id && book.category === category,
  );
  return { sameListing, sameTitle };
}

export async function importCatalogCandidate(
  candidate: CatalogCandidate,
  sourceName: string,
  extras?: ImportExtras,
): Promise<ImportOutcome> {
  if (!candidate.coverUrl) {
    throw new Error(`${candidate.title}: no cover art`);
  }

  const totalPages =
    extras?.totalPages ??
    Math.max(Math.round(Number.parseFloat(candidate.lastChapter ?? "1")) || 1, 1);

  const category =
    extras?.category ??
    (extras?.sourceKey
      ? catalogCategoryForCandidate(
          { key: extras.sourceKey },
          candidate.genres,
        )
      : "MANGA");
  const { sameListing, sameTitle } = await findExistingForCandidate(
    candidate,
    category,
  );

  const data = {
    title: candidate.title,
    summary: candidate.summary,
    coverUrl: candidate.coverUrl,
    totalPages,
    artist: candidate.artist,
    author: candidate.author,
    genres: candidate.genres,
    sourceName,
    sourceUrl: candidate.url,
    externalId: extras?.externalId ?? null,
    publicationStatus:
      extras?.publicationStatus ?? candidate.publicationStatus,
    lastSyncedAt: new Date(),
    isAdult: candidate.isAdult,
    coverCorrupted: false,
  };

  if (sameListing) {
    if (
      extras?.mode === "migrate" &&
      extras.migrateBookId &&
      extras.migrateBookId !== sameListing.id
    ) {
      throw new Error(
        `${candidate.title} is already in the store as a separate listing.`,
      );
    }
    await prisma.book.update({ where: { id: sameListing.id }, data });
    return {
      id: sameListing.id,
      title: candidate.title,
      status: extras?.mode === "migrate" ? "migrated" : "updated",
    };
  }

  if (extras?.mode === "migrate") {
    const requestedId = extras.migrateBookId;
    if (!requestedId) {
      throw new CatalogConflictError({
        candidateTitle: candidate.title,
        incomingSourceName: sourceName,
        existing: sameTitle,
      });
    }

    const target =
      sameTitle.find((book) => book.id === requestedId) ??
      (await prisma.book.findUnique({
        where: { id: requestedId },
        select: conflictSelect,
      }));
    if (!target) {
      throw new Error("Catalog listing to migrate was not found");
    }
    if (target.category !== category) {
      throw new Error(
        `${candidate.title} is already a ${target.category} title; keep manga, novels, and books separate.`,
      );
    }

    await prisma.book.update({ where: { id: target.id }, data });
    // UserBook rows keep the same bookId, so addedAt / progress stay put.
    return { id: target.id, title: candidate.title, status: "migrated" };
  }

  if (sameTitle.length > 0 && extras?.mode !== "duplicate") {
    throw new CatalogConflictError({
      candidateTitle: candidate.title,
      incomingSourceName: sourceName,
      existing: sameTitle,
    });
  }

  const created = await prisma.book.create({
    data: { ...data, category },
    select: { id: true },
  });
  return { id: created.id, title: candidate.title, status: "created" };
}
