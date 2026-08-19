import type { Book, BookCategory } from "@prisma/client";

/** Comics Mihon would treat as manga/manhwa/manhua. Light novels come later. */
export function isReadableComic(category: BookCategory): boolean {
  return category === "MANGA";
}

/** Novels with Internet Archive page scans, read like manga pages. */
export function isReadablePrintBook(category: BookCategory): boolean {
  return category === "BOOK";
}

export function isReadableInApp(category: BookCategory): boolean {
  return isReadableComic(category) || isReadablePrintBook(category);
}

export function canReadBook(
  book: Pick<Book, "category">,
  inLibrary: boolean,
): boolean {
  return inLibrary && isReadableInApp(book.category);
}
