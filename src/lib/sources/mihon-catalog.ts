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
};

export type MihonCatalogStatus = "available" | "added" | "all";

export type MihonCatalogQuery = {
  q?: string;
  lang?: string;
  hideAdult?: boolean;
  status?: MihonCatalogStatus;
  page: number;
};

type IndexSource = {
  id?: string;
  name?: string;
  language?: string;
  homeUrl?: string;
};

type IndexExtension = {
  name?: string;
  packageName?: string;
  versionName?: string;
  contentWarning?: string;
  resources?: { iconUrl?: string };
  sources?: IndexSource[];
};

type IndexPayload = {
  extensionList?: { extensions?: IndexExtension[] };
};

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

export function mihonCatalogHref(params: {
  page?: number;
  q?: string;
  lang?: string;
  hideAdult?: boolean;
  status?: MihonCatalogStatus;
}): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.lang && params.lang !== "en") search.set("lang", params.lang);
  if (params.hideAdult) search.set("hideAdult", "1");
  if (params.status && params.status !== "available") {
    search.set("status", params.status);
  }
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

function isAdultWarning(warning: string | undefined): boolean {
  return (
    warning === "CONTENT_WARNING_NSFW" || warning === "CONTENT_WARNING_MIXED"
  );
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

export function flattenMihonIndex(payload: IndexPayload): MihonCatalogSource[] {
  const grouped = new Map<string, MihonCatalogSource>();

  for (const extension of payload.extensionList?.extensions ?? []) {
    const packageName = extension.packageName?.trim();
    const extensionName = extension.name?.trim();
    if (!packageName || !extensionName) continue;

    for (const source of extension.sources ?? []) {
      const name = source.name?.trim();
      const baseUrl = source.homeUrl?.trim();
      const language = source.language?.trim().toLowerCase();
      if (!name || !baseUrl || !language) continue;
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
        versionName: extension.versionName?.trim() || "unknown",
        language: pickLanguage([language]),
        languages: [language],
        baseUrl,
        iconUrl: extension.resources?.iconUrl?.trim() || null,
        isAdult: isAdultWarning(extension.contentWarning),
        hasImporter: sourceHasImporter(name, suggestedKey, baseUrl),
        suggestedKey,
      });
    }
  }

  return [...grouped.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

export async function fetchMihonCatalog(): Promise<MihonCatalogSource[]> {
  const errors: string[] = [];

  for (const url of INDEX_URLS) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        next: { revalidate: REVALIDATE_SECONDS },
      });
      if (!res.ok) {
        errors.push(`${url}: HTTP ${res.status}`);
        continue;
      }
      const payload = (await res.json()) as IndexPayload;
      const sources = flattenMihonIndex(payload);
      if (sources.length === 0) {
        errors.push(`${url}: empty catalog`);
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

  return sources.filter((source) => {
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
