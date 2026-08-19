import { createCanvas } from "@napi-rs/canvas";
import { getDocument, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

import { MAX_PDF_PAGES } from "@/lib/reader/pdf-pages";
import {
  loadBookPdf,
  readCachedPdfPage,
  writeCachedPdfPage,
} from "@/lib/reader/pdf-store";

const TARGET_LONG_EDGE = 2880;
const TARGET_LONG_EDGE_SAVER = 1400;
const JPEG_FULL = 0.95;
const JPEG_SAVER = 0.82;

class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(Math.ceil(width), Math.ceil(height));
    return { canvas, context: canvas.getContext("2d") };
  }

  reset(
    canvasAndContext: { canvas: ReturnType<typeof createCanvas> },
    width: number,
    height: number,
  ) {
    canvasAndContext.canvas.width = Math.ceil(width);
    canvasAndContext.canvas.height = Math.ceil(height);
  }

  destroy(canvasAndContext: {
    canvas: ReturnType<typeof createCanvas> | null;
    context: unknown;
  }) {
    if (canvasAndContext.canvas) {
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
    }
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

const docs = new Map<string, Promise<PDFDocumentProxy>>();

async function loadPdfDocument(bookId: string): Promise<PDFDocumentProxy> {
  const existing = docs.get(bookId);
  if (existing) return existing;

  const pending = (async () => {
    const bytes = await loadBookPdf(bookId);
    const data = new Uint8Array(bytes);
    return getDocument({
      data,
      CanvasFactory: NodeCanvasFactory,
      useSystemFonts: true,
      disableFontFace: true,
      isOffscreenCanvasSupported: false,
      useWasm: false,
      verbosity: 0,
    }).promise;
  })();

  docs.set(bookId, pending);
  try {
    return await pending;
  } catch (error) {
    docs.delete(bookId);
    throw error;
  }
}

export async function renderPdfPageJpeg(
  bookId: string,
  index: number,
  dataSaver = false,
): Promise<Uint8Array> {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("Invalid page");
  }

  const cached = await readCachedPdfPage(bookId, index, dataSaver);
  if (cached) return cached;

  const doc = await loadPdfDocument(bookId);
  const pageCount = Math.min(doc.numPages, MAX_PDF_PAGES);
  if (index >= pageCount) {
    throw new Error("Page is out of range");
  }

  const page = await doc.getPage(index + 1);
  const base = page.getViewport({ scale: 1 });
  const target = dataSaver ? TARGET_LONG_EDGE_SAVER : TARGET_LONG_EDGE;
  const longEdge = Math.max(base.width, base.height);
  const scale = Math.max(dataSaver ? 1.25 : 2, target / longEdge);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height),
  );
  const context = canvas.getContext("2d");
  await page.render({
    canvas: canvas as unknown as HTMLCanvasElement,
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;

  const jpeg = new Uint8Array(
    canvas.toBuffer("image/jpeg", dataSaver ? JPEG_SAVER : JPEG_FULL),
  );
  await writeCachedPdfPage(bookId, index, dataSaver, jpeg);
  return jpeg;
}
