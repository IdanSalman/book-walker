import type { BookCategory, SourceFamily, SourceKind } from "@prisma/client";

import { sourceFamily } from "@/lib/sources/registry";

const LIGHT_NOVEL_GENRE =
  /\blight\s*novels?\b|\branobe\b|\bweb\s*novels?\b|^\s*novels?\s*$/i;

/** Catalog type implied by a fetch source. Comic sites stay manga unless tags say otherwise. */
export function catalogCategoryForSource(source: {
  key: string;
  kind?: SourceKind;
  family?: SourceFamily | null;
}): BookCategory {
  const family = sourceFamily({
    key: source.key,
    kind: source.kind ?? "SCRAPER",
    family: source.family,
  });
  return family === "BOOK" ? "BOOK" : "MANGA";
}

export function looksLikeLightNovel(genres: string[] | null | undefined): boolean {
  return (genres ?? []).some((genre) => LIGHT_NOVEL_GENRE.test(genre));
}

export function catalogCategoryForCandidate(
  source: { key: string; kind?: SourceKind },
  genres?: string[] | null,
): BookCategory {
  const fromSource = catalogCategoryForSource(source);
  if (fromSource === "BOOK") return "BOOK";
  if (looksLikeLightNovel(genres)) return "LIGHT_NOVEL";
  return "MANGA";
}

export function catalogTitleKey(title: string, category: BookCategory): string {
  return `${category}:${title.trim().toLowerCase()}`;
}
