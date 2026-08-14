import type { BookCategory } from "@prisma/client";

export const CATEGORIES: {
  slug: string;
  label: string;
  value: BookCategory;
  description: string;
}[] = [
  {
    slug: "manga",
    label: "Manga / Manhwa / Manhua",
    value: "MANGA",
    description: "Comics and graphic novels from East Asia",
  },
  {
    slug: "light-novels",
    label: "Light Novels",
    value: "LIGHT_NOVEL",
    description: "Illustrated novels and web novel adaptations",
  },
  {
    slug: "books",
    label: "Books",
    value: "BOOK",
    description: "General fiction and non-fiction",
  },
];

export function categoryFromSlug(slug: string) {
  return CATEGORIES.find((c) => c.slug === slug);
}

export function categoryLabel(category: BookCategory) {
  return CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

export function categorySlug(category: BookCategory) {
  return CATEGORIES.find((c) => c.value === category)?.slug ?? "books";
}
