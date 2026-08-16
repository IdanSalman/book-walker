import type { SourceHealth, SourceKind } from "@prisma/client";

/**
 * Websites the catalog can fetch from. Admins pick from these defaults or add
 * their own; only sources with an importer can pull titles into the catalog.
 */
export type BuiltInSource = {
  key: string;
  name: string;
  baseUrl: string;
  kind: SourceKind;
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
    key: "anilist",
    name: "AniList",
    baseUrl: "https://anilist.co",
    kind: "METADATA",
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
    key: "openlibrary",
    name: "Open Library",
    baseUrl: "https://openlibrary.org",
    kind: "API",
    language: "en",
    supportsSearch: false,
    supportsMetadata: false,
    supportsReading: false,
    isAdultSource: false,
    priority: 60,
    notes:
      "Public book API behind the novel and book part of the catalog. Entries were bulk imported; no live importer is wired up yet.",
    healthPath: "https://openlibrary.org/search.json?q=dune&limit=1",
  },
  {
    key: "toonily",
    name: "Toonily",
    baseUrl: "https://toonily.com",
    kind: "SCRAPER",
    language: "en",
    supportsSearch: false,
    supportsMetadata: false,
    supportsReading: false,
    isAdultSource: true,
    priority: 20,
    notes:
      "Mihon Toonily source. Cloudflare currently blocks server-side fetches, so reading is not wired yet.",
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
  SCRAPER: "Scanlation site",
  METADATA: "Metadata only",
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
