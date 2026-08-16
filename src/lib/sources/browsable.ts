import { prisma } from "@/lib/prisma";
import { READING_ENGINES, sourceEngine } from "@/lib/reader/resolve";
import type { CatalogCandidate } from "@/lib/reader/types";
import type { SourceBrowseItem } from "@/lib/sources/browse";
import { catalogBooksByTitles, catalogBooksByUrls } from "@/lib/sources/import-title";

export type BrowsableSource = {
  key: string;
  name: string;
};

export async function getBrowsableSources(): Promise<BrowsableSource[]> {
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
): Promise<SourceBrowseItem[]> {
  const [catalog, byTitle] = await Promise.all([
    catalogBooksByUrls(items.map((item) => item.url)),
    catalogBooksByTitles(items.map((item) => item.title)),
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
          select: { bookId: true, status: true },
        });
  const inLibrary = new Set(library.map((entry) => entry.bookId));
  const completed = new Set(
    library
      .filter((entry) => entry.status === "COMPLETED")
      .map((entry) => entry.bookId),
  );

  return items.map((item) => {
    const book = catalog.get(item.url);
    const existingTitle = book
      ? null
      : (titleMap.get(item.title.trim().toLowerCase()) ?? null);
    const bookId = book?.id ?? existingTitle?.id ?? null;
    return {
      ...item,
      inCatalog: Boolean(book),
      bookId: book?.id ?? null,
      inLibrary: bookId ? inLibrary.has(bookId) : false,
      completed: bookId ? completed.has(bookId) : false,
      existingTitle,
    };
  });
}
