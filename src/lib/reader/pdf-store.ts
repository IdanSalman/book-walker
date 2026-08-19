import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { MAX_PDF_BYTES, isPdfBytes } from "@/lib/reader/pdf-pages";

const PDF_ROOT = path.join(process.cwd(), "data", "pdfs");

function bookDir(bookId: string): string {
  return path.join(PDF_ROOT, bookId);
}

export function pdfFilePath(bookId: string): string {
  return path.join(bookDir(bookId), "book.pdf");
}

function pageCachePath(bookId: string, index: number, dataSaver: boolean): string {
  const suffix = dataSaver ? "s" : "f";
  return path.join(bookDir(bookId), `page-${index}-${suffix}.v3.jpg`);
}

export async function saveBookPdf(
  bookId: string,
  bytes: Uint8Array,
): Promise<void> {
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new Error("PDF is too large (max 64 MB)");
  }
  if (!isPdfBytes(bytes)) {
    throw new Error("File is not a PDF");
  }
  await mkdir(bookDir(bookId), { recursive: true });
  await writeFile(pdfFilePath(bookId), bytes);
}

export async function loadBookPdf(bookId: string): Promise<Uint8Array> {
  try {
    return new Uint8Array(await readFile(pdfFilePath(bookId)));
  } catch {
    throw new Error("No PDF is stored for this title");
  }
}

export async function deleteBookPdf(bookId: string): Promise<void> {
  await rm(bookDir(bookId), { recursive: true, force: true });
}

export async function readCachedPdfPage(
  bookId: string,
  index: number,
  dataSaver: boolean,
): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(pageCachePath(bookId, index, dataSaver)));
  } catch {
    return null;
  }
}

export async function writeCachedPdfPage(
  bookId: string,
  index: number,
  dataSaver: boolean,
  bytes: Uint8Array,
): Promise<void> {
  await mkdir(bookDir(bookId), { recursive: true });
  await writeFile(pageCachePath(bookId, index, dataSaver), bytes);
}
