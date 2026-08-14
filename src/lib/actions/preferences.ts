"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { revalidateUserLibrary } from "@/lib/revalidate-library";
import { requireUser } from "@/lib/session";

export async function updateHideAdultContent(hide: boolean): Promise<void> {
  const session = await requireUser();

  await prisma.user.update({
    where: { id: session.user.id },
    data: { hideAdultContent: hide },
  });

  revalidateUserLibrary(session.user.id);
  revalidatePath("/account");
  revalidatePath("/books", "layout");
  revalidatePath("/read", "layout");
  revalidatePath("/category", "layout");
}
