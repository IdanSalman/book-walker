import type { Book, BookCategory } from "@prisma/client";

/** Comics Mihon would treat as manga/manhwa/manhua. Light novels come later. */
export function isReadableComic(category: BookCategory): boolean {
  return category === "MANGA";
}

export function canReadBook(
  book: Pick<Book, "category">,
  inLibrary: boolean,
): boolean {
  return inLibrary && isReadableComic(book.category);
}
