import { PDFDocument } from "pdf-lib";

import type { ReaderPage } from "@/lib/reader/types";

export const LOCAL_PDF_KEY = "localpdf";
export const LOCAL_PDF_NAME = "Local PDF";
export const MAX_PDF_PAGES = 2500;
export const MAX_PDF_BYTES = 64 * 1024 * 1024;

const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

export function isPdfBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  return PDF_MAGIC.every((byte, index) => bytes[index] === byte);
}

export function encodePdfPayload(bookId: string, pageCount: number): string {
  return `${bookId}:${pageCount}`;
}

export function decodePdfPayload(
  payload: string,
): { bookId: string; pageCount: number | null } | null {
  const idx = payload.lastIndexOf(":");
  if (idx <= 0) {
    return payload ? { bookId: payload, pageCount: null } : null;
  }
  const bookId = payload.slice(0, idx);
  const count = Number.parseInt(payload.slice(idx + 1), 10);
  if (!bookId) return null;
  if (!Number.isFinite(count) || count < 1) {
    return { bookId, pageCount: null };
  }
  return { bookId, pageCount: count };
}

export function pdfDocumentUrl(bookId: string): string {
  return `/api/reader/pdf?bookId=${encodeURIComponent(bookId)}`;
}

export function pdfPageUrl(
  bookId: string,
  index: number,
  dataSaver = false,
): string {
  const saver = dataSaver ? "&dataSaver=1" : "";
  return `/api/reader/pdf-page?bookId=${encodeURIComponent(bookId)}&n=${index}${saver}`;
}

export function pagesForPdf(
  bookId: string,
  pageCount: number,
  _dataSaver = false,
): ReaderPage[] {
  const count = Math.min(MAX_PDF_PAGES, Math.max(0, pageCount));
  const documentUrl = pdfDocumentUrl(bookId);
  const pages: ReaderPage[] = [];
  for (let index = 0; index < count; index += 1) {
    pages.push({
      index,
      url: `${documentUrl}#${index}`,
      render: "pdf",
    });
  }
  return pages;
}

export async function pdfPageCount(bytes: Uint8Array): Promise<number> {
  if (!isPdfBytes(bytes)) {
    throw new Error("File is not a PDF");
  }
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const count = doc.getPageCount();
  if (count < 1) throw new Error("PDF has no pages");
  if (count > MAX_PDF_PAGES) {
    throw new Error(`PDF has too many pages (max ${MAX_PDF_PAGES})`);
  }
  return count;
}

/** One single-page PDF per original page, 0-based order. */
export async function splitPdfPages(bytes: Uint8Array): Promise<Uint8Array[]> {
  const count = await pdfPageCount(bytes);
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages: Uint8Array[] = [];

  for (let index = 0; index < count; index += 1) {
    const part = await PDFDocument.create();
    const [copied] = await part.copyPages(source, [index]);
    part.addPage(copied);
    pages.push(await part.save());
  }

  return pages;
}
