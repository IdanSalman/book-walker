import type { BookCategory } from "@prisma/client";

import type {
  CatalogCandidate,
  ReaderPage,
  ResolvedManga,
} from "@/lib/reader/types";
import type {
  SourceBrowsePage,
  SourceBrowseQuery,
  SourceCategory,
} from "@/lib/sources/browse";

export type ReaderBookRef = {
  id?: string | null;
  title: string;
  sourceUrl: string | null;
  externalId: string | null;
  sourceName?: string | null;
  author?: string | null;
  category?: BookCategory;
};

export type ReaderSourceEngine = {
  key: string;
  name: string;
  aliases: string[];
  hosts: string[];
  imageHosts: string[];
  imageReferer?: string;
  search(query: string): Promise<CatalogCandidate[]>;
  getById?(id: string): Promise<CatalogCandidate>;
  browse?(query: SourceBrowseQuery): Promise<SourceBrowsePage>;
  categories?(hideAdult?: boolean): Promise<SourceCategory[]>;
  resolveManga(book: ReaderBookRef): Promise<ResolvedManga>;
  getPageList(payload: string, dataSaver?: boolean): Promise<ReaderPage[]>;
};

export function engineMatchesUrl(
  engine: ReaderSourceEngine,
  url: string | null | undefined,
): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return engine.hosts.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

export function engineMatchesName(
  engine: ReaderSourceEngine,
  sourceName: string | null | undefined,
): boolean {
  if (!sourceName) return false;
  const compact = sourceName.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return [engine.key, engine.name, ...engine.aliases].some((alias) => {
    const needle = alias.toLowerCase().replace(/[^a-z0-9]+/g, "");
    return compact === needle || compact.includes(needle);
  });
}
