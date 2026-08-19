import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PDFDocument } from "pdf-lib";

import {
  decodePdfPayload,
  encodePdfPayload,
  isPdfBytes,
  pagesForPdf,
  pdfPageCount,
  splitPdfPages,
} from "./pdf-pages";

async function makePdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) {
    const page = doc.addPage([200, 300]);
    page.drawText(`Page ${i + 1}`, { x: 24, y: 250, size: 18 });
  }
  return doc.save();
}

describe("pdf page helpers", () => {
  it("encodes and decodes a book id with page count", () => {
    assert.deepEqual(decodePdfPayload(encodePdfPayload("clxyz", 42)), {
      bookId: "clxyz",
      pageCount: 42,
    });
    assert.deepEqual(decodePdfPayload("clxyz"), {
      bookId: "clxyz",
      pageCount: null,
    });
  });

  it("builds one reader page per PDF page", () => {
    const pages = pagesForPdf("book1", 3);
    assert.equal(pages.length, 3);
    assert.equal(pages[0]?.index, 0);
    assert.equal(pages[0]?.render, "pdf");
    assert.equal(pages[2]?.url, "/api/reader/pdf?bookId=book1#2");
  });

  it("counts and splits a PDF into one document per page", async () => {
    const bytes = await makePdf(3);
    assert.equal(isPdfBytes(bytes), true);
    assert.equal(await pdfPageCount(bytes), 3);

    const parts = await splitPdfPages(bytes);
    assert.equal(parts.length, 3);
    for (const part of parts) {
      assert.equal(isPdfBytes(part), true);
      assert.equal(await pdfPageCount(part), 1);
    }
  });

  it("rejects non-PDF bytes", async () => {
    await assert.rejects(() => pdfPageCount(new Uint8Array([1, 2, 3, 4])), {
      message: "File is not a PDF",
    });
  });
});
