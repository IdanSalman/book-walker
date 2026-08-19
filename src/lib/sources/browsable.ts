import { prisma } from "@/lib/prisma";
import { READING_ENGINES, sourceEngine } from "@/lib/reader/resolve";
import type { CatalogCandidate } from "@/lib/reader/types";
import type { SourceBrowseItem } from "@/lib/sources/browse";
import { catalogCategoryForSource } from "@/lib/sources/catalog-kind";
import { ensureBuiltInSources } from "@/lib/sources/ensure";
import {
  catalogBooksByTitles,
  catalogBooksByUrls,
  isSameCatalogListing,
} from "@/lib/sources/import-title";

export type BrowsableSource = {
  key: string;
  name: string;
};

export async function getBrowsableSources(): Promise<BrowsableSource[]> {
  await ensureBuiltInSources();
  const rows = await prisma.fetchSource.findMany({
    where: { enabled: true },
    orderBy: [{ priority: "desc" }, { name: "asc" }],
    select: {
      key: true,
      name: true,
      supportsSearch: true,
      kind: true,
    },
  });

  if (rows.length === 0) {
    return READING_ENGINES.filter((engine) => engine.browse).map((engine) => ({
      key: engine.key,
      name: engine.name,
    }));
  }

  const sources: BrowsableSource[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.kind === "METADATA") continue;
    const engine = await sourceEngine(row.key);
    if (!engine?.browse) continue;
    // Extra Comick (or other alias) rows still resolve to one engine.
    if (seen.has(engine.key)) continue;
    seen.add(engine.key);
    sources.push({
      key: engine.key,
      name: row.key === engine.key ? row.name : engine.name,
    });
  }
  return sources;
}

export async function resolveBrowsableSource(
  key: string,
): Promise<BrowsableSource | null> {
  const engine = await sourceEngine(key);
  if (!engine?.browse) return null;

  const row = await prisma.fetchSource.findUnique({
    where: { key: engine.key },
    select: { name: true, enabled: true },
  });
  if (row && !row.enabled) return null;

  return { key: engine.key, name: row?.name ?? engine.name };
}

export async function annotateBrowseItems(
  items: CatalogCandidate[],
  userId: string,
  sourceKey?: string,
): Promise<SourceBrowseItem[]> {
  const category = sourceKey
    ? catalogCategoryForSource({ key: sourceKey })
    : undefined;
  const [catalog, byTitle] = await Promise.all([
    catalogBooksByUrls(items.map((item) => item.url)),
    catalogBooksByTitles(
      items.map((item) => item.title),
      category,
    ),
  ]);
  const titleMap = new Map(
    byTitle.map((book) => [book.title.trim().toLowerCase(), book]),
  );
  const bookIds = [
    ...new Set([
      ...[...catalog.values()].map((book) => book.id),
      ...byTitle.map((book) => book.id),
    ]),
  ];
  const library =
    bookIds.length === 0
      ? []
      : await prisma.userBook.findMany({
          where: { userId, bookId: { in: bookIds } },
          select: { bookId: true, currentPage: true, book: { select: { totalPages: true } } },
        });
  const inLibrary = new Set(library.map((entry) => entry.bookId));
  const caughtUp = new Set(
    library
      .filter(
        (entry) =>
          entry.book.totalPages > 0 &&
          entry.currentPage >= entry.book.totalPages,
      )
      .map((entry) => entry.bookId),
  );

  return items.map((item) => {
    const book =
      catalog.get(item.url) ??
      byTitle.find((row) =>
        isSameCatalogListing({ title: item.title, url: item.url }, row),
      ) ??
      null;
    const existingTitle = book
      ? null
      : (titleMap.get(item.title.trim().toLowerCase()) ?? null);
    const bookId = book?.id ?? existingTitle?.id ?? null;
    return {
      ...item,
      inCatalog: Boolean(book),
      bookId: book?.id ?? null,
      inLibrary: bookId ? inLibrary.has(bookId) : false,
      caughtUp: bookId ? caughtUp.has(bookId) : false,
      existingTitle,
    };
  });
}
