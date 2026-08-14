export const UNCATEGORIZED_SLUG = "uncategorized";
export const UNCATEGORIZED_NAME = "Uncategorized";

export function libraryCategorySlug(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) return "collection";
  if (slug === UNCATEGORIZED_SLUG) return "uncategorized-collection";
  return slug;
}

export function isRealCategoryName(name: string | null | undefined): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed !== "0";
}

export function uniqueLibraryCategorySlug(
  name: string,
  existingSlugs: Iterable<string>,
): string {
  const taken = new Set(existingSlugs);
  const base = libraryCategorySlug(name);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
