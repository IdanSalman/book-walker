import {
  BUILT_IN_SOURCES,
  canImportFromSource,
  slugifySourceKey,
} from "@/lib/sources/registry";

const INDEX_URLS = [
  "https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.json",
  "https://cdn.jsdelivr.net/gh/keiyoushi/extensions@repo/index.json",
];

const REVALIDATE_SECONDS = 6 * 60 * 60;
export const MIHON_CATALOG_PAGE_SIZE = 30;
export const MIHON_ADD_LIMIT = 50;

const LANGUAGE_LABELS: Record<string, string> = {
  "*": "Any language",
  all: "Multi-language",
  other: "Other",
  en: "English",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  "zh-hans": "Chinese (Simplified)",
  "zh-hant": "Chinese (Traditional)",
  es: "Spanish",
  "es-419": "Spanish (LATAM)",
  pt: "Portuguese",
  "pt-br": "Portuguese (Brazil)",
  fr: "French",
  de: "German",
  it: "Italian",
  ru: "Russian",
  ar: "Arabic",
  id: "Indonesian",
  th: "Thai",
  vi: "Vietnamese",
  tr: "Turkish",
  pl: "Polish",
  uk: "Ukrainian",
  nl: "Dutch",
};

export type MihonCatalogSource = {
  id: string;
  name: string;
  packageName: string;
  extensionName: string;
  versionName: string;
  language: string;
  languages: string[];
  baseUrl: string;
  iconUrl: string | null;
  isAdult: boolean;
  hasImporter: boolean;
  suggestedKey: string;
  popularRank: number | null;
};

export type MihonCatalogStatus = "available" | "added" | "all";
export type MihonCatalogSort = "popular" | "name";

export type MihonCatalogQuery = {
  q?: string;
  lang?: string;
  hideAdult?: boolean;
  status?: MihonCatalogStatus;
  sort?: MihonCatalogSort;
  page: number;
};

type IndexSource = {
  id?: string;
  name?: string;
  lang?: string;
  language?: string;
  baseUrl?: string;
  homeUrl?: string;
};

type IndexExtension = {
  name?: string;
  pkg?: string;
  packageName?: string;
  version?: string;
  versionName?: string;
  nsfw?: number;
  contentWarning?: string;
  resources?: { iconUrl?: string };
  sources?: IndexSource[];
};

const ICON_BASE =
  "https://raw.githubusercontent.com/keiyoushi/extensions/repo/icon";

const SKIP_EXTENSION = /outdated app|update to mihon|^local source$|example source/i;

/** Widely used English Mihon sources, roughly by how often they cover library titles. */
const POPULAR_ENGLISH: { key: string; name: string }[] = [
  { key: "mangadex", name: "mangadex" },
  { key: "comick", name: "comick" },
  { key: "weebcentral", name: "weeb central" },
  { key: "asurascans", name: "asura scans" },
  { key: "manganato", name: "manganato" },
  { key: "mangakakalot", name: "mangakakalot" },
  { key: "mangageko", name: "manga geko" },
  { key: "mangageko", name: "manga gecko" },
  { key: "nelomanga", name: "nelomanga" },
  { key: "natomanga", name: "natomanga" },
  { key: "toonily", name: "toonily" },
  { key: "bato", name: "bato.to" },
  { key: "mangafire", name: "mangafire" },
  { key: "mangapark", name: "manga park" },
  { key: "mangabuddy", name: "manga buddy" },
  { key: "mangakatana", name: "manga katana" },
  { key: "webtoons", name: "webtoons" },
  { key: "mangaplus", name: "manga plus" },
  { key: "flamecomics", name: "flame comics" },
  { key: "hivescans", name: "hive scans" },
  { key: "reaperscans", name: "reaper scans" },
  { key: "tcbscans", name: "tcb scans" },
  { key: "likemanga", name: "like manga" },
  { key: "mangahub", name: "mangahub" },
  { key: "mangaread", name: "mangaread" },
  { key: "rizzfables", name: "rizzfables" },
  { key: "templescans", name: "temple scans" },
  { key: "luminousscans", name: "luminous scans" },
  { key: "drakecomic", name: "drake scans" },
  { key: "nightscans", name: "night scans" },
];

function extensionsFromPayload(payload: unknown): IndexExtension[] {
  if (Array.isArray(payload)) return payload as IndexExtension[];
  if (payload && typeof payload === "object" && "extensionList" in payload) {
    const list = (payload as { extensionList?: { extensions?: IndexExtension[] } })
      .extensionList?.extensions;
    return list ?? [];
  }
  return [];
}

function extensionIcon(packageName: string, explicit?: string): string | null {
  const fromIndex = explicit?.trim();
  if (fromIndex) return fromIndex;
  if (!packageName) return null;
  return `${ICON_BASE}/${packageName}.png`;
}

function compactName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function popularRankFor(
  name: string,
  suggestedKey: string,
  packageName: string,
): number | null {
  const nameCompact = compactName(name);
  const keyL = suggestedKey.toLowerCase();
  const pkgL = packageName.toLowerCase();
  for (let i = 0; i < POPULAR_ENGLISH.length; i++) {
    const item = POPULAR_ENGLISH[i];
    const itemCompact = compactName(item.name);
    if (keyL === item.key) return i + 1;
    if (nameCompact === itemCompact) return i + 1;
    const pkgTail = pkgL.split(".").pop() ?? "";
    if (pkgTail === item.key || pkgL.endsWith(`.${item.key}`)) return i + 1;
  }
  return null;
}

export type ConfiguredSourceRef = {
  key: string;
  name: string;
  baseUrl: string;
  language: string;
};

export function languageLabel(code: string): string {
  return LANGUAGE_LABELS[code] ?? code;
}

export function parseMihonStatus(
  value: string | undefined,
): MihonCatalogStatus {
  return value === "added" || value === "all" ? value : "available";
}

export function parseMihonLang(value: string | undefined): string {
  const lang = value?.trim().toLowerCase();
  if (!lang || lang === "en") return "en";
  return lang;
}

export function parseMihonSort(value: string | undefined): MihonCatalogSort {
  return value === "name" ? "name" : "popular";
}

export function mihonCatalogHref(params: {
  page?: number;
  q?: string;
  lang?: string;
  hideAdult?: boolean;
  status?: MihonCatalogStatus;
  sort?: MihonCatalogSort;
}): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.lang && params.lang !== "en") search.set("lang", params.lang);
  if (params.hideAdult) search.set("hideAdult", "1");
  if (params.status && params.status !== "available") {
    search.set("status", params.status);
  }
  if (params.sort && params.sort !== "popular") search.set("sort", params.sort);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return query ? `/admin/sources/browse?${query}` : "/admin/sources/browse";
}

export function normalizeSourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").toLowerCase();
  }
}

function catalogId(packageName: string, name: string, baseUrl: string): string {
  return `${packageName}::${normalizeSourceHost(baseUrl)}::${name.toLowerCase()}`;
}

function pickLanguage(languages: string[]): string {
  if (languages.includes("en")) return "en";
  if (languages.includes("all")) return "all";
  return [...languages].sort()[0] ?? "en";
}

function isAdultExtension(extension: IndexExtension): boolean {
  if (extension.contentWarning === "CONTENT_WARNING_MIXED") return false;
  if (extension.contentWarning === "CONTENT_WARNING_NSFW") return true;
  return extension.nsfw === 1;
}

function matchingBuiltIn(name: string, key: string, baseUrl: string) {
  return BUILT_IN_SOURCES.find(
    (item) =>
      item.key === key ||
      item.name.toLowerCase() === name.toLowerCase() ||
      normalizeSourceHost(item.baseUrl) === normalizeSourceHost(baseUrl),
  );
}

function sourceHasImporter(name: string, key: string, baseUrl: string): boolean {
  if (canImportFromSource({ key })) return true;
  const preset = matchingBuiltIn(name, key, baseUrl);
  return preset ? canImportFromSource(preset) : false;
}

export function flattenMihonIndex(payload: unknown): MihonCatalogSource[] {
  const grouped = new Map<string, MihonCatalogSource>();

  for (const extension of extensionsFromPayload(payload)) {
    const packageName =
      extension.pkg?.trim() || extension.packageName?.trim() || "";
    const extensionName = extension.name?.trim();
    if (!packageName || !extensionName) continue;
    if (SKIP_EXTENSION.test(extensionName)) continue;

    const versionName =
      extension.version?.trim() ||
      extension.versionName?.trim() ||
      "unknown";
    const iconUrl = extensionIcon(
      packageName,
      extension.resources?.iconUrl,
    );
    const adult = isAdultExtension(extension);

    for (const source of extension.sources ?? []) {
      const name = source.name?.trim();
      const baseUrl = source.baseUrl?.trim() || source.homeUrl?.trim();
      const language = (source.lang ?? source.language)?.trim().toLowerCase();
      if (!name || !baseUrl || !language) continue;
      if (SKIP_EXTENSION.test(name)) continue;
      if (!/^https?:\/\//i.test(baseUrl)) continue;

      const id = catalogId(packageName, name, baseUrl);
      const existing = grouped.get(id);
      if (existing) {
        if (!existing.languages.includes(language)) {
          existing.languages.push(language);
          existing.languages.sort();
          existing.language = pickLanguage(existing.languages);
        }
        continue;
      }

      const slug = slugifySourceKey(name);
      const suggestedKey = matchingBuiltIn(name, slug, baseUrl)?.key ?? slug;
      grouped.set(id, {
        id,
        name,
        packageName,
        extensionName,
        versionName,
        language: pickLanguage([language]),
        languages: [language],
        baseUrl,
        iconUrl,
        isAdult: adult,
        hasImporter: sourceHasImporter(name, suggestedKey, baseUrl),
        suggestedKey,
        popularRank: popularRankFor(name, suggestedKey, packageName),
      });
    }
  }

  return [...grouped.values()].sort(compareMihonSources);
}

function compareMihonSources(
  a: MihonCatalogSource,
  b: MihonCatalogSource,
  sort: MihonCatalogSort = "popular",
): number {
  if (sort === "popular") {
    const rankA = a.popularRank ?? Number.POSITIVE_INFINITY;
    const rankB = b.popularRank ?? Number.POSITIVE_INFINITY;
    if (rankA !== rankB) return rankA - rankB;
  }
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export async function fetchMihonCatalog(): Promise<MihonCatalogSource[]> {
  const errors: string[] = [];

  for (const url of INDEX_URLS) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        next: { revalidate: REVALIDATE_SECONDS },
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) {
        errors.push(`${url}: HTTP ${res.status}`);
        continue;
      }
      const payload: unknown = await res.json();
      const sources = flattenMihonIndex(payload);
      if (sources.length < 10) {
        errors.push(`${url}: stub catalog (${sources.length} sources)`);
        continue;
      }
      return sources;
    } catch (err) {
      errors.push(
        `${url}: ${err instanceof Error ? err.message : "fetch failed"}`,
      );
    }
  }

  throw new Error(
    `Could not load the Mihon source catalog. ${errors.join(" · ")}`,
  );
}

export function isMihonSourceConfigured(
  source: Pick<MihonCatalogSource, "name" | "baseUrl" | "suggestedKey">,
  configured: ConfiguredSourceRef[],
): boolean {
  const host = normalizeSourceHost(source.baseUrl);
  const name = source.name.toLowerCase();
  return configured.some((row) => {
    if (row.key === source.suggestedKey) return true;
    if (normalizeSourceHost(row.baseUrl) === host) return true;
    return row.name.toLowerCase() === name;
  });
}

export function filterMihonCatalog(
  sources: MihonCatalogSource[],
  query: MihonCatalogQuery,
  configured: ConfiguredSourceRef[],
): MihonCatalogSource[] {
  const needle = query.q?.trim().toLowerCase();
  const lang = query.lang ?? "en";

  const matched = sources.filter((source) => {
    const added = isMihonSourceConfigured(source, configured);
    if (query.status === "available" && added) return false;
    if (query.status === "added" && !added) return false;
    if (query.hideAdult && source.isAdult) return false;
    if (lang !== "*") {
      const matchesLang = source.languages.includes(lang);
      const englishAlsoSeesAll =
        lang === "en" && source.languages.includes("all");
      if (!matchesLang && !englishAlsoSeesAll) return false;
    }
    if (!needle) return true;
    return (
      source.name.toLowerCase().includes(needle) ||
      source.extensionName.toLowerCase().includes(needle) ||
      source.baseUrl.toLowerCase().includes(needle) ||
      source.packageName.toLowerCase().includes(needle)
    );
  });
  const sort = query.sort ?? "popular";
  return matched.sort((a, b) => compareMihonSources(a, b, sort));
}

export function popularUnconfiguredSources(
  sources: MihonCatalogSource[],
  configured: ConfiguredSourceRef[],
  limit = 24,
): MihonCatalogSource[] {
  return sources
    .filter((source) => {
      if (isMihonSourceConfigured(source, configured)) return false;
      if (source.isAdult) return false;
      if (source.popularRank == null) return false;
      return (
        source.languages.includes("en") || source.languages.includes("all")
      );
    })
    .sort((a, b) => compareMihonSources(a, b, "popular"))
    .slice(0, limit);
}

export function mihonCatalogLanguages(
  sources: MihonCatalogSource[],
): string[] {
  const langs = new Set<string>();
  for (const source of sources) {
    for (const language of source.languages) langs.add(language);
  }
  return [...langs].sort((a, b) => {
    if (a === "en") return -1;
    if (b === "en") return 1;
    if (a === "all") return -1;
    if (b === "all") return 1;
    return languageLabel(a).localeCompare(languageLabel(b));
  });
}

export function findMihonSourcesById(
  catalog: MihonCatalogSource[],
  ids: string[],
): MihonCatalogSource[] {
  const wanted = new Set(ids);
  return catalog.filter((source) => wanted.has(source.id));
}
