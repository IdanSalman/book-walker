import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type SourceRef = { name: string; key: string };

/** Catalog entries are linked to a source by the free-text `sourceName` field. */
export function sourceBookWhere(source: SourceRef): Prisma.BookWhereInput {
  return {
    OR: [
      { sourceName: { equals: source.name, mode: "insensitive" } },
      { sourceName: { contains: source.key, mode: "insensitive" } },
    ],
  };
}

export function sourceNameMatches(
  sourceName: string,
  source: SourceRef,
): boolean {
  const value = sourceName.toLowerCase();
  const compact = value.replace(/[^a-z0-9]+/g, "");
  const key = source.key.toLowerCase();
  const name = source.name.toLowerCase();
  const nameCompact = name.replace(/[^a-z0-9]+/g, "");
  return (
    value === name ||
    compact === key ||
    compact === nameCompact ||
    compact.includes(key) ||
    value.includes(key)
  );
}

/** Catalog total for a source, from pre-grouped `sourceName` counts. */
export function sourceCatalogCount(
  rows: { name: string; count: number }[],
  source: SourceRef,
): number {
  return rows
    .filter((row) => sourceNameMatches(row.name, source))
    .reduce((total, row) => total + row.count, 0);
}

export type SourceCatalogStats = {
  total: number;
  ongoing: number;
  adult: number;
  neverSynced: number;
  lastSyncedAt: Date | null;
};

export async function sourceCatalogStats(
  source: SourceRef,
): Promise<SourceCatalogStats> {
  const where = sourceBookWhere(source);

  const [total, ongoing, adult, neverSynced, latest] = await Promise.all([
    prisma.book.count({ where }),
    prisma.book.count({
      where: { AND: [where, { publicationStatus: { in: ["ONGOING", "HIATUS"] } }] },
    }),
    prisma.book.count({ where: { AND: [where, { isAdult: true }] } }),
    prisma.book.count({ where: { AND: [where, { lastSyncedAt: null }] } }),
    prisma.book.findFirst({
      where: { AND: [where, { lastSyncedAt: { not: null } }] },
      orderBy: { lastSyncedAt: "desc" },
      select: { lastSyncedAt: true },
    }),
  ]);

  return {
    total,
    ongoing,
    adult,
    neverSynced,
    lastSyncedAt: latest?.lastSyncedAt ?? null,
  };
}

/** Distinct `sourceName` values in the catalog, most-used first. */
export async function catalogSourceNames(
  limit = 40,
): Promise<{ name: string; count: number }[]> {
  const rows = await prisma.book.groupBy({
    by: ["sourceName"],
    where: { sourceName: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { sourceName: "desc" } },
    take: limit,
  });

  return rows
    .filter((row) => row.sourceName != null && row.sourceName.trim().length > 0)
    .map((row) => ({ name: row.sourceName!, count: row._count._all }));
}

/** Blank source names are treated the same as missing ones. */
export async function booksWithoutSourceCount(): Promise<number> {
  return prisma.book.count({
    where: { OR: [{ sourceName: null }, { sourceName: "" }] },
  });
}
