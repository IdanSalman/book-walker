import { revalidatePath, revalidateTag } from "next/cache";

import { LIBRARY_NAV_GLOBAL_TAG, libraryNavTag } from "@/lib/cache-tags";

export function revalidateUserLibrary(userId: string, bookId?: string) {
  revalidateTag(libraryNavTag(userId), { expire: 0 });
  revalidatePath("/library");
  revalidatePath("/dashboard");
  revalidatePath("/library/add");
  if (bookId) {
    revalidatePath(`/books/${bookId}`);
  }
}

/** Chapter totals live on the catalog title, so every library needs a fresh count. */
export function revalidateCatalogChapterCount(bookId: string) {
  revalidateTag(LIBRARY_NAV_GLOBAL_TAG, { expire: 0 });
  revalidatePath(`/books/${bookId}`);
  revalidatePath(`/read/${bookId}`);
  revalidatePath("/library");
  revalidatePath("/dashboard");
  revalidatePath("/library/add");
}
