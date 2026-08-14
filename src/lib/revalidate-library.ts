import { revalidatePath, revalidateTag } from "next/cache";

import { libraryNavTag } from "@/lib/cache-tags";

export function revalidateUserLibrary(userId: string, bookId?: string) {
  revalidateTag(libraryNavTag(userId), { expire: 0 });
  revalidatePath("/library");
  revalidatePath("/dashboard");
  revalidatePath("/library/add");
  if (bookId) {
    revalidatePath(`/books/${bookId}`);
  }
}
