import type { SourceHealth, SourceKind } from "@prisma/client";

export type SourceFamily = "COMIC" | "BOOK" | "METADATA";

/**
 * Websites the catalog can fetch from. Admins pick from these defaults or add
 * their own; only sources with an importer can pull titles into the catalog.
 */
export type BuiltInSource = {
  key: string;
  name: string;
  baseUrl: string;
  kind: SourceKind;
  family: SourceFamily;
  language: string;
  supportsSearch: boolean;
  supportsMetadata: boolean;
  supportsReading: boolean;
  isAdultSource: boolean;
  priority: number;
  notes: string;
  /** Endpoint used by the connection test when the homepage is not a good probe. */
  healthPath?: string;
  healthMethod?: "GET" | "POST";
  healthBody?: string;
};

export const BUILT_IN_SOURCES: BuiltInSource[] = [
  {
    key: "mangadex",
    name: "MangaDex",
    baseUrl: "https://mangadex.org",
    kind: "API",
    family: "COMIC",
    language: "en",
    supportsSearch: true,
    supportsMetadata: true,
    supportsReading: true,
    isAdultSource: false,
    priority: 100,
    notes:
      "Public MangaDex API — the same source Mihon uses. Powers catalog import, chapter counts and in-app reading.",
    healthPath: "https://api.mangadex.org/ping",
  },
  {
    key: "weebcentral",
    name: "Weeb Central",
    baseUrl: "https://weebcentral.com",
    kind: "SCRAPER",
    family: "COMIC",
    language: "en",
    supportsSearch: true,
    supportsMetadata: false,
    supportsReading: true,
    isAdultSource: false,
    priority: 90,
    notes:
      "Mihon source that replaced MangaSee / MangaLife. Used to read titles that are not on MangaDex.",
    healthPath: "https://weebcentral.com/search/data?text=a&limit=1&offset=0&display_mode=Full+Display",
  },
  {
    key: "asurascans",
    name: "Asura Scans",
    baseUrl: "https://asurascans.com",
    kind: "SCRAPER",
    family: "COMIC",
    language: "en",
    supportsSearch: true,
    supportsMetadata: false,
    supportsReading: true,
    isAdultSource: false,
    priority: 85,
    notes:
      "Mihon Asura Scans source. Search, import and in-app reading for series hosted on Asura.",
    healthPath: "https://api.asurascans.com/api/series?limit=1&offset=0",
  },
  {
    key: "comick",
    name: "Comick",
    baseUrl: "https://comick.dev",
    kind: "API",
    family: "COMIC",
    language: "en",
    supportsSearch: true,
    supportsMetadata: false,
    supportsReading: true,
    isAdultSource: false,
    priority: 88,
    notes:
      "Mihon Comick source. Uses the public Comick API (api.comick.dev) for search, import and reading.",
    healthPath:
      "https://api.comick.dev/v1.0/search?limit=1&page=1&sort=user_follow_count&tachiyomi=true",
  },
  {
    key: "toonily",
    name: "Toonily",
    baseUrl: "https://toonily.com",
    kind: "SCRAPER",
    family: "COMIC",
    language: "en",
    supportsSearch: true,
    supportsMetadata: false,
    supportsReading: true,
    isAdultSource: true,
    priority: 80,
    notes:
      "Mihon Toonily source (Madara). Uses /serie/ URLs, the toonily-mature cookie, and madara_load_more.",
    healthPath: "https://toonily.com/wp-admin/admin-ajax.php",
    healthMethod: "POST",
    healthBody:
      "action=madara_load_more&page=0&template=madara-core/content/content-archive&vars[post_type]=wp-manga&vars[post_status]=publish",
  },
  {
    key: "openlibrary",
    name: "Open Library",
    baseUrl: "https://openlibrary.org",
    kind: "API",
    family: "BOOK",
    language: "en",
    supportsSearch: false,
    supportsMetadata: true,
    supportsReading: true,
    isAdultSource: false,
    priority: 60,
    notes:
      "Public book catalog. In-app reading uses freely available Internet Archive page scans (not borrow-restricted ebooks).",
    healthPath: "https://openlibrary.org/search.json?q=dune&limit=1",
  },
  {
    key: "internetarchive",
    name: "Internet Archive",
    baseUrl: "https://archive.org",
    kind: "API",
    family: "BOOK",
    language: "en",
    supportsSearch: false,
    supportsMetadata: false,
    supportsReading: true,
    isAdultSource: false,
    priority: 58,
    notes:
      "Scanned page images for public-domain books. Same JPEG page pipeline as manga reading.",
    healthPath: "https://archive.org/metadata/prideprejudice00aust",
  },
  {
    key: "gutenberg",
    name: "Project Gutenberg",
    baseUrl: "https://www.gutenberg.org",
    kind: "API",
    family: "BOOK",
    language: "en",
    supportsSearch: false,
    supportsMetadata: false,
    supportsReading: false,
    isAdultSource: false,
    priority: 55,
    notes:
      "70,000+ public-domain texts (HTML and plain text). Catalog and text reader are not wired yet; connection tests hit a public ebook file.",
    healthPath: "https://www.gutenberg.org/cache/epub/11/pg11.txt",
  },
  {
    key: "standardebooks",
    name: "Standard Ebooks",
    baseUrl: "https://standardebooks.org",
    kind: "API",
    family: "BOOK",
    language: "en",
    supportsSearch: false,
    supportsMetadata: false,
    supportsReading: false,
    isAdultSource: false,
    priority: 54,
    notes:
      "Hand-proofed public-domain EPUBs via OPDS. Needs an EPUB renderer before in-app reading.",
    healthPath: "https://standardebooks.org/feeds/opds",
  },
  {
    key: "wikisource",
    name: "Wikisource",
    baseUrl: "https://en.wikisource.org",
    kind: "API",
    family: "BOOK",
    language: "en",
    supportsSearch: false,
    supportsMetadata: false,
    supportsReading: false,
    isAdultSource: false,
    priority: 52,
    notes:
      "Wiki-hosted public-domain texts. MediaWiki API is available; in-app reading is not wired yet.",
    healthPath:
      "https://en.wikisource.org/w/api.php?action=query&meta=siteinfo&format=json",
  },
  {
    key: "gallica",
    name: "Gallica",
    baseUrl: "https://gallica.bnf.fr",
    kind: "API",
    family: "BOOK",
    language: "fr",
    supportsSearch: false,
    supportsMetadata: false,
    supportsReading: false,
    isAdultSource: false,
    priority: 50,
    notes:
      "BnF digital library: French public-domain scans (IIIF) and EPUBs via OPDS. Page-image reading is not wired yet.",
    healthPath: "https://gallica.bnf.fr/opds",
  },
  {
    key: "anilist",
    name: "AniList",
    baseUrl: "https://anilist.co",
    kind: "METADATA",
    family: "METADATA",
    language: "en",
    supportsSearch: false,
    supportsMetadata: true,
    supportsReading: false,
    isAdultSource: false,
    priority: 80,
    notes:
      "Metadata only. Refetches chapter counts and publication status for books with an anilist: external ID.",
    healthPath: "https://graphql.anilist.co",
    healthMethod: "POST",
    healthBody: JSON.stringify({
      query: "{ Page(perPage: 1) { media(type: MANGA) { id } } }",
    }),
  },
  {
    key: "hathitrust",
    name: "HathiTrust",
    baseUrl: "https://www.hathitrust.org",
    kind: "METADATA",
    family: "METADATA",
    language: "en",
    supportsSearch: false,
    supportsMetadata: true,
    supportsReading: false,
    isAdultSource: false,
    priority: 35,
    notes:
      "Academic scan catalog. Full page images are usually login-walled, so this is metadata only.",
    healthPath: "https://catalog.hathitrust.org",
  },
  {
    key: "googlebooks",
    name: "Google Books",
    baseUrl: "https://books.google.com",
    kind: "METADATA",
    family: "METADATA",
    language: "en",
    supportsSearch: false,
    supportsMetadata: true,
    supportsReading: false,
    isAdultSource: false,
    priority: 34,
    notes:
      "Public volumes API for covers and descriptions. Previews are not a full in-app reader.",
    healthPath: "https://www.googleapis.com/books/v1/volumes?q=alice&maxResults=1",
  },
];

export function builtInSource(key: string): BuiltInSource | undefined {
  return BUILT_IN_SOURCES.find((source) => source.key === key);
}

/** Stored columns for a preset; the health probe config stays in code. */
export function builtInSourceData(preset: BuiltInSource) {
  return {
    key: preset.key,
    name: preset.name,
    baseUrl: preset.baseUrl,
    kind: preset.kind,
    family: preset.family,
    language: preset.language,
    priority: preset.priority,
    supportsSearch: preset.supportsSearch,
    supportsMetadata: preset.supportsMetadata,
    supportsReading: preset.supportsReading,
    isAdultSource: preset.isAdultSource,
    notes: preset.notes,
  };
}

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  API: "Public API",
  SCRAPER: "Website scraper",
  METADATA: "Metadata only",
};

export function sourceFamily(source: {
  key: string;
  kind: SourceKind;
  family?: SourceFamily | null;
}): SourceFamily {
  if (source.family) return source.family;
  const preset = builtInSource(source.key);
  if (preset) return preset.family;
  if (source.kind === "METADATA") return "METADATA";
  return "COMIC";
}

export const SOURCE_FAMILY_ORDER: SourceFamily[] = [
  "COMIC",
  "BOOK",
  "METADATA",
];

export const SOURCE_FAMILY_LABELS: Record<SourceFamily, string> = {
  COMIC: "Manga & comics",
  BOOK: "Books & public-domain texts",
  METADATA: "Metadata catalogs",
};

export const SOURCE_FAMILY_BLURBS: Record<SourceFamily, string> = {
  COMIC:
    "Mihon-style sites that list chapters and page images for manga, manhwa, and manhua.",
  BOOK:
    "Libraries that can supply book scans or public-domain text. Only Open Library / Internet Archive page scans are readable in-app today.",
  METADATA:
    "Used to refresh covers, page counts, and publication status. These do not serve a full reader.",
};

export const SOURCE_HEALTH_LABELS: Record<SourceHealth, string> = {
  UNKNOWN: "Not tested",
  ONLINE: "Online",
  DEGRADED: "Degraded",
  OFFLINE: "Offline",
};

export const SOURCE_HEALTH_STYLES: Record<SourceHealth, string> = {
  UNKNOWN: "border-zinc-700 bg-zinc-800 text-zinc-300",
  ONLINE: "border-emerald-900/50 bg-emerald-950/50 text-emerald-300",
  DEGRADED: "border-amber-900/50 bg-amber-950/50 text-amber-300",
  OFFLINE: "border-red-900/50 bg-red-950/50 text-red-300",
};

export const SOURCE_FAMILY_STYLES: Record<SourceFamily, string> = {
  COMIC: "border-violet-900/50 bg-violet-950/50 text-violet-300",
  BOOK: "border-sky-900/50 bg-sky-950/50 text-sky-300",
  METADATA: "border-zinc-700 bg-zinc-800 text-zinc-300",
};

/** Built-in importers, or any enabled scraper the admin turned search on for. */
export function canImportFromSource(source: {
  key: string;
  supportsSearch?: boolean;
  kind?: string;
}): boolean {
  if (
    source.key === "mangadex" ||
    source.key === "asurascans" ||
    source.key === "weebcentral" ||
    source.key === "comick"
  ) {
    return true;
  }
  if (source.kind === "METADATA") return false;
  return source.supportsSearch === true;
}

export function slugifySourceKey(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
