"use server";

import { ReadingStatus } from "@prisma/client";
import { z } from "zod";

import {
  UNCATEGORIZED_NAME,
  uniqueLibraryCategorySlug,
} from "@/lib/library-categories";
import { prisma } from "@/lib/prisma";
import { isOngoingPublication } from "@/lib/publication";
import { revalidateUserLibrary } from "@/lib/revalidate-library";
import { requireUser } from "@/lib/session";

export type ActionState = {
  error?: string;
  success?: boolean;
};

export async function addToLibrary(bookId: string): Promise<ActionState> {
  const session = await requireUser();

  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) {
    return { error: "Book not found" };
  }

  await prisma.userBook.upsert({
    where: {
      userId_bookId: {
        userId: session.user.id,
        bookId,
      },
    },
    create: {
      userId: session.user.id,
      bookId,
      status: "PLAN_TO_READ",
      currentPage: 0,
      addedAt: new Date(),
    },
    // Keep addedAt / progress if the title is already in the library.
    update: {},
  });

  revalidateUserLibrary(session.user.id, bookId);
  return { success: true };
}

export async function removeFromLibrary(bookId: string): Promise<ActionState> {
  const session = await requireUser();

  await prisma.userBook.deleteMany({
    where: { userId: session.user.id, bookId },
  });

  revalidateUserLibrary(session.user.id, bookId);
  return { success: true };
}

const updateSchema = z.object({
  currentPage: z.coerce.number().int().min(0),
  rating: z
    .union([z.coerce.number().min(1).max(5), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v == null ? null : v)),
  status: z.nativeEnum(ReadingStatus),
});

export async function updateUserBook(
  bookId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireUser();

  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) {
    return { error: "Book not found" };
  }

  const parsed = updateSchema.safeParse({
    currentPage: formData.get("currentPage"),
    rating: formData.get("rating"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let { currentPage, rating, status } = parsed.data;

  if (currentPage > book.totalPages) {
    return { error: `Page cannot exceed ${book.totalPages}` };
  }

  if (
    currentPage === book.totalPages &&
    currentPage > 0 &&
    !isOngoingPublication(book.publicationStatus)
  ) {
    status = "COMPLETED";
  } else if (currentPage > 0 && status === "PLAN_TO_READ") {
    status = "READING";
  }

  const requestedCategoryIds = formData.getAll("categoryIds").filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const shouldSyncCategories = formData.get("syncCategories") === "1";
  const ownedCategories =
    shouldSyncCategories && requestedCategoryIds.length
      ? await prisma.libraryCategory.findMany({
          where: { userId: session.user.id, id: { in: requestedCategoryIds } },
          select: { id: true },
        })
      : [];
  const categoryIds = ownedCategories.map((c) => c.id);

  await prisma.$transaction(async (tx) => {
    const userBook = await tx.userBook.update({
      where: {
        userId_bookId: {
          userId: session.user.id,
          bookId,
        },
      },
      data: {
        currentPage,
        rating,
        status,
      },
    });

    if (shouldSyncCategories) {
      await tx.userBookCategory.deleteMany({
        where: { userBookId: userBook.id },
      });
      if (categoryIds.length) {
        await tx.userBookCategory.createMany({
          data: categoryIds.map((categoryId) => ({
            userBookId: userBook.id,
            categoryId,
          })),
        });
      }
    }
  });

  revalidateUserLibrary(session.user.id, bookId);
  return { success: true };
}

const categoryNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(50, "Name must be 50 characters or less")
  .transform((name) => name.replace(/\s+/g, " "));

function revalidateCollections(userId: string) {
  revalidateUserLibrary(userId);
}

function isReservedCollectionName(name: string) {
  return name.toLowerCase() === UNCATEGORIZED_NAME.toLowerCase();
}

export async function createLibraryCategory(
  name: string,
): Promise<ActionState & { id?: string }> {
  const session = await requireUser();
  const parsed = categoryNameSchema.safeParse(name);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid name" };
  }

  const categoryName = parsed.data;
  if (isReservedCollectionName(categoryName)) {
    return { error: "That name is reserved." };
  }

  const existing = await prisma.libraryCategory.findMany({
    where: { userId: session.user.id },
    select: { name: true, slug: true, sortOrder: true },
  });
  if (
    existing.some((c) => c.name.toLowerCase() === categoryName.toLowerCase())
  ) {
    return { error: "A collection with that name already exists." };
  }

  const maxSort = existing.reduce(
    (max, c) => Math.max(max, c.sortOrder),
    -1,
  );
  const created = await prisma.libraryCategory.create({
    data: {
      userId: session.user.id,
      name: categoryName,
      slug: uniqueLibraryCategorySlug(
        categoryName,
        existing.map((c) => c.slug),
      ),
      sortOrder: maxSort + 1,
    },
    select: { id: true },
  });

  revalidateCollections(session.user.id);
  return { success: true, id: created.id };
}

export async function renameLibraryCategory(
  categoryId: string,
  name: string,
): Promise<ActionState & { slug?: string }> {
  const session = await requireUser();
  const parsed = categoryNameSchema.safeParse(name);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid name" };
  }

  const categoryName = parsed.data;
  if (isReservedCollectionName(categoryName)) {
    return { error: "That name is reserved." };
  }

  const category = await prisma.libraryCategory.findFirst({
    where: { id: categoryId, userId: session.user.id },
    select: { id: true, name: true, slug: true },
  });
  if (!category) {
    return { error: "Collection not found" };
  }

  const existing = await prisma.libraryCategory.findMany({
    where: { userId: session.user.id },
    select: { id: true, name: true, slug: true },
  });
  if (
    existing.some(
      (c) =>
        c.id !== category.id &&
        c.name.toLowerCase() === categoryName.toLowerCase(),
    )
  ) {
    return { error: "A collection with that name already exists." };
  }

  const slug = uniqueLibraryCategorySlug(
    categoryName,
    existing.filter((c) => c.id !== category.id).map((c) => c.slug),
  );

  await prisma.libraryCategory.update({
    where: { id: category.id },
    data: { name: categoryName, slug },
  });

  revalidateCollections(session.user.id);
  return { success: true, slug };
}

export async function deleteLibraryCategory(
  categoryId: string,
): Promise<ActionState> {
  const session = await requireUser();

  const result = await prisma.libraryCategory.deleteMany({
    where: { id: categoryId, userId: session.user.id },
  });
  if (result.count === 0) {
    return { error: "Collection not found" };
  }

  revalidateCollections(session.user.id);
  return { success: true };
}
