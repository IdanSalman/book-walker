import { prisma } from "@/lib/prisma";
import type { CatalogCandidate } from "@/lib/reader/types";
import type { PublicationStatus } from "@prisma/client";

export type ImportOutcome = {
  id: string;
  title: string;
  status: "created" | "updated" | "migrated";
};

export type ImportMode = "migrate" | "duplicate";

export type CatalogConflict = {
  id: string;
  title: string;
  sourceName: string | null;
  sourceUrl: string | null;
};

export type ImportExtras = {
  totalPages?: number;
  externalId?: string | null;
  publicationStatus?: PublicationStatus;
  mode?: ImportMode;
  migrateBookId?: string;
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
  sourceName: true,
  sourceUrl: true,
} as const;

export async function catalogBooksByUrls(
  urls: string[],
): Promise<Map<string, CatalogConflict>> {
  if (urls.length === 0) return new Map();
  const books = await prisma.book.findMany({
    where: { sourceUrl: { in: urls } },
    select: conflictSelect,
  });
  const map = new Map<string, CatalogConflict>();
  for (const book of books) {
    if (book.sourceUrl) map.set(book.sourceUrl, book);
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
): Promise<CatalogConflict[]> {
  const unique = [
    ...new Set(titles.map((title) => title.trim()).filter(Boolean)),
  ];
  if (unique.length === 0) return [];
  return prisma.book.findMany({
    where: {
      OR: unique.map((title) => ({
        title: { equals: title, mode: "insensitive" as const },
      })),
    },
    select: conflictSelect,
  });
}

export async function findExistingForCandidate(
  candidate: Pick<CatalogCandidate, "title" | "url">,
): Promise<{
  sameListing: CatalogConflict | null;
  sameTitle: CatalogConflict[];
}> {
  const books = await prisma.book.findMany({
    where: {
      OR: [
        { sourceUrl: candidate.url },
        { title: { equals: candidate.title, mode: "insensitive" } },
      ],
    },
    select: conflictSelect,
  });
  const sameListing =
    books.find((book) => book.sourceUrl === candidate.url) ?? null;
  const sameTitle = books.filter((book) => book.sourceUrl !== candidate.url);
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

  const { sameListing, sameTitle } = await findExistingForCandidate(candidate);

  const data = {
    title: candidate.title,
    summary: candidate.summary,
    coverUrl: candidate.coverUrl,
    totalPages,
    category: "MANGA" as const,
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
    data,
    select: { id: true },
  });
  return { id: created.id, title: candidate.title, status: "created" };
}
