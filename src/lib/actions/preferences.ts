"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { parseReadingModePreference } from "@/lib/reader/types";
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

export async function updateHideReadTitles(hide: boolean): Promise<void> {
  const session = await requireUser();

  await prisma.user.update({
    where: { id: session.user.id },
    data: { hideReadTitles: hide },
  });

  revalidateUserLibrary(session.user.id);
  revalidatePath("/account");
  revalidatePath("/library/add", "layout");
}

export async function updateDefaultReadingMode(mode: string): Promise<void> {
  const session = await requireUser();
  const next = parseReadingModePreference(mode);

  await prisma.user.update({
    where: { id: session.user.id },
    data: { defaultReadingMode: next },
  });

  revalidatePath("/account");
  revalidatePath("/read", "layout");
}
