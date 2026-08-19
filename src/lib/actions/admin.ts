"use server";

import { BookCategory, PublicationStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { categoryLabel } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import { isPngCoverUrl, scanPngCoverStatuses } from "@/lib/cover-validation";
import { LOCAL_PDF_NAME, pdfPageCount } from "@/lib/reader/pdf-pages";
import { deleteBookPdf, saveBookPdf } from "@/lib/reader/pdf-store";
import { requireAdmin } from "@/lib/session";
import { enrichCustomBook, PLACEHOLDER_SUMMARY } from "@/lib/sources/custom-book";
import {
  repairBookCover,
  repairMissingCovers,
} from "@/lib/sources/repair-cover";
import { syncBookMetadata } from "@/lib/sync/book-metadata";

function parseGenres(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function parseOptionalString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const bookSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  summary: z.string().max(5000),
  coverUrl: z
    .string()
    .max(2000)
    .refine(
      (value) => value === "" || URL.canParse(value),
      "Cover must be a valid URL",
    ),
  totalPages: z.coerce.number().int().min(1, "Total pages must be at least 1"),
  category: z.nativeEnum(BookCategory),
  artist: z.string().max(200).nullable(),
  author: z.string().max(200).nullable(),
  sourceName: z.string().max(200).nullable(),
  sourceUrl: z.string().max(500).nullable(),
  externalId: z.string().max(100).nullable(),
  publicationStatus: z.nativeEnum(PublicationStatus),
  genres: z.array(z.string().max(100)).max(20),
  isAdult: z.boolean(),
  coverCorrupted: z.boolean(),
});

export type ActionState = {
  error?: string;
  success?: boolean;
  message?: string;
};

function revalidateCatalog(bookId?: string) {
  revalidatePath("/admin/books");
  revalidatePath("/library/add");
  revalidatePath("/library");
  revalidatePath("/dashboard");
  if (bookId) {
    revalidatePath(`/admin/books/${bookId}/edit`);
    revalidatePath(`/books/${bookId}`);
  }
}

function formDataToObject(formData: FormData) {
  const cover = formData.get("coverUrl");
  const summary = formData.get("summary");
  return {
    title: formData.get("title"),
    summary: typeof summary === "string" ? summary.trim() : "",
    coverUrl: typeof cover === "string" ? cover.trim() : "",
    totalPages: formData.get("totalPages"),
    category: formData.get("category"),
    artist: parseOptionalString(formData.get("artist")),
    author: parseOptionalString(formData.get("author")),
    sourceName: parseOptionalString(formData.get("sourceName")),
    sourceUrl: parseOptionalString(formData.get("sourceUrl")),
    externalId: parseOptionalString(formData.get("externalId")),
    publicationStatus: formData.get("publicationStatus") as PublicationStatus,
    genres: parseGenres(formData.get("genres")),
    isAdult:
      formData.get("isAdult") === "on" || formData.get("isAdult") === "true",
    coverCorrupted:
      formData.get("coverCorrupted") === "on" ||
      formData.get("coverCorrupted") === "true",
  };
}

async function pdfBytesFromForm(formData: FormData): Promise<Uint8Array | null> {
  const file = formData.get("pdf");
  if (!file || typeof file === "string" || file.size === 0) return null;
  return new Uint8Array(await file.arrayBuffer());
}

export async function createBook(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = bookSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let pdfBytes: Uint8Array | null;
  try {
    pdfBytes = await pdfBytesFromForm(formData);
  } catch {
    return { error: "Could not read the PDF file" };
  }

  let pdfPages: number | null = null;
  if (pdfBytes) {
    try {
      pdfPages = await pdfPageCount(pdfBytes);
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Invalid PDF",
      };
    }
  }

  const duplicate = await prisma.book.findFirst({
    where: {
      title: { equals: parsed.data.title, mode: "insensitive" },
      category: pdfBytes ? "BOOK" : parsed.data.category,
    },
    select: { id: true },
  });
  if (duplicate) {
    return {
      error: `A ${categoryLabel(pdfBytes ? "BOOK" : parsed.data.category)} titled "${parsed.data.title}" is already in the catalog.`,
    };
  }

  const data = {
    ...parsed.data,
    summary: parsed.data.summary || PLACEHOLDER_SUMMARY,
    coverUrl: parsed.data.coverUrl,
    ...(pdfBytes
      ? {
          category: "BOOK" as const,
          totalPages: pdfPages ?? parsed.data.totalPages,
          publicationStatus: "COMPLETED" as const,
          sourceName: LOCAL_PDF_NAME,
          sourceUrl: null,
        }
      : {}),
  };

  const created = await prisma.book.create({
    data,
    select: { id: true },
  });

  try {
    if (pdfBytes) {
      await saveBookPdf(created.id, pdfBytes);
      await prisma.book.update({
        where: { id: created.id },
        data: { externalId: `pdf:${created.id}` },
      });
    }
  } catch (error) {
    await deleteBookPdf(created.id);
    await prisma.book.delete({ where: { id: created.id } }).catch(() => {});
    return {
      error: error instanceof Error ? error.message : "Failed to store PDF",
    };
  }

  await enrichCustomBook(created.id);

  revalidateCatalog(created.id);
  redirect("/admin/books");
}

export async function updateBook(
  bookId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = bookSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const pdfBytes = await pdfBytesFromForm(formData).catch(() => null);
  let pdfPages: number | null = null;
  if (pdfBytes) {
    try {
      pdfPages = await pdfPageCount(pdfBytes);
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Invalid PDF",
      };
    }
  }

  const duplicate = await prisma.book.findFirst({
    where: {
      id: { not: bookId },
      title: { equals: parsed.data.title, mode: "insensitive" },
      category: pdfBytes ? "BOOK" : parsed.data.category,
    },
    select: { id: true },
  });
  if (duplicate) {
    return {
      error: `A ${categoryLabel(pdfBytes ? "BOOK" : parsed.data.category)} titled "${parsed.data.title}" is already in the catalog.`,
    };
  }

  await prisma.book.update({
    where: { id: bookId },
    data: {
      ...parsed.data,
      summary: parsed.data.summary || PLACEHOLDER_SUMMARY,
      ...(pdfBytes
        ? {
            category: "BOOK" as const,
            totalPages: pdfPages ?? parsed.data.totalPages,
            publicationStatus: "COMPLETED" as const,
            sourceName: LOCAL_PDF_NAME,
            sourceUrl: null,
            externalId: `pdf:${bookId}`,
          }
        : {}),
    },
  });

  if (pdfBytes) {
    await saveBookPdf(bookId, pdfBytes);
  }

  if (!parsed.data.coverUrl || pdfBytes) {
    await enrichCustomBook(bookId);
  }

  revalidateCatalog(bookId);
  return { success: true };
}

export async function deleteBook(bookId: string): Promise<ActionState> {
  await requireAdmin();

  await prisma.book.delete({ where: { id: bookId } });
  await deleteBookPdf(bookId);
  revalidateCatalog(bookId);
  redirect("/admin/books");
}

export async function scanBookCovers(bookIds: string[]): Promise<ActionState> {
  await requireAdmin();

  if (bookIds.length === 0) {
    return { error: "No books to scan" };
  }

  const books = await prisma.book.findMany({
    where: { id: { in: bookIds } },
    select: { id: true, coverUrl: true },
  });

  const results = await scanPngCoverStatuses(books);

  await Promise.all(
    results.map((result) =>
      prisma.book.update({
        where: { id: result.id },
        data: { coverCorrupted: result.corrupted },
      }),
    ),
  );

  revalidateCatalog();
  const corrupted = results.filter((r) => !r.skipped && r.corrupted).length;
  return {
    success: true,
    message: `Scanned this page: ${corrupted} corrupted PNG(s) found`,
  };
}

export async function scanAllPngCovers(): Promise<ActionState> {
  await requireAdmin();

  const books = await prisma.book.findMany({
    select: { id: true, coverUrl: true },
    orderBy: { title: "asc" },
  });

  const pngCount = books.filter((b) => isPngCoverUrl(b.coverUrl)).length;
  if (pngCount === 0) {
    return { error: "No PNG covers in the catalog" };
  }

  const results = await scanPngCoverStatuses(books, 10);

  const batchSize = 100;
  for (let i = 0; i < results.length; i += batchSize) {
    const batch = results.slice(i, i + batchSize);
    await Promise.all(
      batch.map((result) =>
        prisma.book.update({
          where: { id: result.id },
          data: { coverCorrupted: result.corrupted },
        }),
      ),
    );
  }

  const corrupted = results.filter((r) => !r.skipped && r.corrupted).length;
  const ok = results.filter((r) => !r.skipped && !r.corrupted).length;

  revalidateCatalog();
  return {
    success: true,
    message: `Scanned ${pngCount} PNG covers: ${ok} OK, ${corrupted} corrupted`,
  };
}

export async function repairMissingCoversAction(): Promise<ActionState> {
  await requireAdmin();

  const result = await repairMissingCovers();
  if (result.scanned === 0) {
    return { error: "No titles with missing or broken covers" };
  }

  revalidateCatalog();

  const parts = [
    `Checked ${result.scanned} title${result.scanned === 1 ? "" : "s"}`,
  ];
  if (result.repaired > 0) {
    parts.push(`replaced ${result.repaired} cover${result.repaired === 1 ? "" : "s"}`);
  }
  if (result.reloaded > 0) {
    parts.push(
      `reloaded ${result.reloaded} existing image${result.reloaded === 1 ? "" : "s"}`,
    );
  }
  if (result.assigned > 0) {
    parts.push(`assigned ${result.assigned} source${result.assigned === 1 ? "" : "s"}`);
  }
  if (result.failed > 0) {
    parts.push(`${result.failed} still missing`);
  }

  return { success: true, message: parts.join(", ") };
}

export async function repairBookCoverAction(bookId: string): Promise<ActionState> {
  await requireAdmin();

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    select: {
      id: true,
      title: true,
      coverUrl: true,
      coverCorrupted: true,
      sourceName: true,
      sourceUrl: true,
      category: true,
      author: true,
    },
  });
  if (!book) return { error: "Book not found" };

  const outcome = await repairBookCover(book);
  revalidateCatalog(bookId);

  if (outcome.error && !outcome.repaired && !outcome.reloaded) {
    return { error: outcome.error };
  }

  if (outcome.sourceAssigned) {
    return {
      success: true,
      message: `Found a cover on ${outcome.sourceName} and assigned that source`,
    };
  }
  if (outcome.repaired) {
    return { success: true, message: "Replaced the cover from another source" };
  }
  return { success: true, message: "Existing cover loaded successfully" };
}

export async function setCoverCorrupted(
  bookId: string,
  coverCorrupted: boolean,
): Promise<ActionState> {
  await requireAdmin();

  await prisma.book.update({
    where: { id: bookId },
    data: { coverCorrupted },
  });

  revalidateCatalog(bookId);
  return { success: true };
}

export async function setBookAdult(
  bookId: string,
  isAdult: boolean,
): Promise<ActionState> {
  await requireAdmin();

  await prisma.book.update({
    where: { id: bookId },
    data: { isAdult },
  });

  revalidateCatalog(bookId);
  return { success: true };
}

export async function syncBookMetadataAction(
  bookId: string,
): Promise<ActionState> {
  await requireAdmin();

  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) {
    return { error: "Book not found" };
  }

  try {
    const result = await syncBookMetadata({
      title: book.title,
      category: book.category,
      externalId: book.externalId,
      sourceUrl: book.sourceUrl,
      sourceName: book.sourceName,
      publicationStatus: book.publicationStatus,
    });

    await prisma.book.update({
      where: { id: bookId },
      data: {
        totalPages: result.totalPages,
        publicationStatus: result.publicationStatus,
        sourceUrl: result.sourceUrl ?? book.sourceUrl,
        sourceName: result.sourceName ?? book.sourceName,
        externalId: result.externalId ?? book.externalId,
        lastSyncedAt: result.lastSyncedAt,
      },
    });

    revalidateCatalog(bookId);

    const from = result.syncedFrom ? ` from ${result.syncedFrom}` : "";
    return {
      success: true,
      message: `Synced${from}: ${result.totalPages} chapters, status ${result.publicationStatus}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return { error: message };
  }
}

export async function syncOngoingManga(
  bookIds: string[],
): Promise<ActionState> {
  await requireAdmin();

  if (bookIds.length === 0) {
    return { error: "No books selected" };
  }

  const books = await prisma.book.findMany({
    where: {
      id: { in: bookIds },
      category: "MANGA",
      publicationStatus: { in: ["ONGOING", "HIATUS", "UNKNOWN"] },
    },
    select: {
      id: true,
      title: true,
      externalId: true,
      sourceUrl: true,
      sourceName: true,
      publicationStatus: true,
    },
  });

  if (books.length === 0) {
    return { error: "No ongoing manga on this page to sync" };
  }

  let updated = 0;
  const errors: string[] = [];

  for (const book of books) {
    try {
      const result = await syncBookMetadata(book);
      await prisma.book.update({
        where: { id: book.id },
        data: {
          totalPages: result.totalPages,
          publicationStatus: result.publicationStatus,
          sourceUrl: result.sourceUrl ?? book.sourceUrl,
          sourceName: result.sourceName ?? book.sourceName,
          externalId: result.externalId ?? book.externalId,
          lastSyncedAt: result.lastSyncedAt,
        },
      });
      updated += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      errors.push(`${book.title}: ${message}`);
    }
  }

  revalidateCatalog();

  if (updated === 0) {
    return {
      error: errors[0] ?? "Could not sync any titles",
    };
  }

  const suffix =
    errors.length > 0 ? ` (${errors.length} failed)` : "";

  return {
    success: true,
    message: `Synced ${updated} of ${books.length} manga${suffix}`,
  };
}
