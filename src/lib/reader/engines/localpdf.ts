import { encodeChapterId } from "@/lib/reader/source-id";
import {
  decodePdfPayload,
  encodePdfPayload,
  LOCAL_PDF_KEY,
  LOCAL_PDF_NAME,
  pdfPageCount,
  pagesForPdf,
} from "@/lib/reader/pdf-pages";
import { loadBookPdf } from "@/lib/reader/pdf-store";
import type {
  ReaderBookRef,
  ReaderSourceEngine,
} from "@/lib/reader/source-engine";
import type { ResolvedManga } from "@/lib/reader/types";

function bookIdFromRef(book: ReaderBookRef): string | null {
  const fromExternal = book.externalId?.startsWith("pdf:")
    ? book.externalId.slice(4)
    : null;
  if (fromExternal) return fromExternal;
  if (!book.sourceUrl) return null;
  try {
    const parsed = new URL(book.sourceUrl);
    const match = parsed.pathname.match(/\/pdf\/([^/]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

async function resolveLocalPdf(book: ReaderBookRef): Promise<ResolvedManga> {
  const bookId = bookIdFromRef(book);
  if (!bookId) {
    throw new Error("This title has no stored PDF.");
  }

  const bytes = await loadBookPdf(bookId);
  const pageCount = await pdfPageCount(bytes);

  return {
    manga: {
      id: bookId,
      title: book.title,
      originalLanguage: "en",
      contentRating: "safe",
    },
    chapters: [
      {
        id: encodeChapterId(
          LOCAL_PDF_KEY,
          encodePdfPayload(bookId, pageCount),
        ),
        name: "PDF",
        chapterNumber: 1,
        volume: null,
        title: `${pageCount.toLocaleString()} pages`,
        scanlationGroup: LOCAL_PDF_NAME,
        publishedAt: null,
        pageCount,
      },
    ],
    sourceKey: LOCAL_PDF_KEY,
    sourceName: LOCAL_PDF_NAME,
    sourceUrl: book.sourceUrl,
    coverUrl: null,
  };
}

export const localPdfEngine: ReaderSourceEngine = {
  key: LOCAL_PDF_KEY,
  name: LOCAL_PDF_NAME,
  aliases: ["Uploaded PDF", "Custom PDF"],
  hosts: [],
  imageHosts: [],
  search: async () => [],
  resolveManga: resolveLocalPdf,
  getPageList: async (payload, dataSaver = false) => {
    const decoded = decodePdfPayload(payload);
    if (!decoded) throw new Error("Invalid PDF chapter");
    let pageCount = decoded.pageCount;
    if (pageCount == null) {
      pageCount = await pdfPageCount(await loadBookPdf(decoded.bookId));
    }
    const pages = pagesForPdf(decoded.bookId, pageCount, dataSaver);
    if (pages.length === 0) throw new Error("No pages in this PDF");
    return pages;
  },
};
