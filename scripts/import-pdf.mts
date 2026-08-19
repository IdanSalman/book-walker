/**
 * Import a purchased PDF into the local catalog and (optionally) an admin library.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/import-pdf.mts --pdf "C:\path\book.pdf" --title "The Game" --author "Neil Strauss"
 */

import { readFile } from "node:fs/promises";

import { prisma } from "../src/lib/prisma";
import { LOCAL_PDF_NAME, pdfPageCount } from "../src/lib/reader/pdf-pages";
import { saveBookPdf } from "../src/lib/reader/pdf-store";
import {
  PLACEHOLDER_SUMMARY,
  enrichCustomBook,
} from "../src/lib/sources/custom-book";

function argValue(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx < 0) return undefined;
  return argv[idx + 1];
}

async function main() {
  const pdfPath = argValue(process.argv, "--pdf");
  const title = argValue(process.argv, "--title")?.trim();
  const author = argValue(process.argv, "--author")?.trim() || null;

  if (!pdfPath || !title) {
    console.error(
      'Usage: npx tsx --env-file=.env scripts/import-pdf.mts --pdf "<file>" --title "<title>" [--author "<author>"]',
    );
    process.exitCode = 1;
    return;
  }

  const bytes = new Uint8Array(await readFile(pdfPath));
  const pageCount = await pdfPageCount(bytes);

  const existing = await prisma.book.findFirst({
    where: {
      title: { equals: title, mode: "insensitive" },
      category: "BOOK",
    },
    select: { id: true },
  });
  if (existing) {
    console.error(`Already in the catalog: ${existing.id}`);
    process.exitCode = 1;
    return;
  }

  const created = await prisma.book.create({
    data: {
      title,
      author,
      summary: PLACEHOLDER_SUMMARY,
      coverUrl: "",
      totalPages: pageCount,
      category: "BOOK",
      publicationStatus: "COMPLETED",
      sourceName: LOCAL_PDF_NAME,
      sourceUrl: null,
      genres: [],
    },
    select: { id: true },
  });

  await saveBookPdf(created.id, bytes);
  await prisma.book.update({
    where: { id: created.id },
    data: { externalId: `pdf:${created.id}` },
  });

  const cover = await enrichCustomBook(created.id);

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true, email: true },
  });
  for (const admin of admins) {
    await prisma.userBook.upsert({
      where: {
        userId_bookId: { userId: admin.id, bookId: created.id },
      },
      create: {
        userId: admin.id,
        bookId: created.id,
        status: "PLAN_TO_READ",
      },
      update: {},
    });
  }

  const book = await prisma.book.findUnique({
    where: { id: created.id },
    select: { title: true, author: true, totalPages: true, coverUrl: true },
  });

  console.log(
    JSON.stringify(
      {
        id: created.id,
        title: book?.title,
        author: book?.author,
        pages: book?.totalPages,
        coverFound: cover.coverFound,
        coverUrl: book?.coverUrl || null,
        addedToLibraries: admins.length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
