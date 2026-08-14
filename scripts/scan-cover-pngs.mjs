/**
 * Scan all PNG cover URLs in the catalog and set Book.coverCorrupted.
 *
 * Usage:
 *   npm run scan:covers
 *   npm run scan:covers -- --limit 100
 *   npm run scan:covers -- --dry-run
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 512 * 1024;

function parseArgs(argv) {
  const args = { dryRun: false, limit: null, concurrency: 8 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a === "--concurrency") args.concurrency = Number(argv[++i]);
  }
  return args;
}

function isPngCoverUrl(url) {
  if (!url?.trim()) return false;
  const lower = url.toLowerCase();
  return (
    lower.includes(".png") ||
    lower.includes("image/png") ||
    lower.includes("/png/") ||
    lower.includes("format=png")
  );
}

function isPngSignature(bytes) {
  if (bytes.length < 8) return false;
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

function hasValidPngImageData(bytes) {
  if (!isPngSignature(bytes) || bytes.length < 33) return false;
  const chunkType = String.fromCharCode(...bytes.slice(12, 16));
  if (chunkType !== "IHDR") return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(16) > 0 && view.getUint32(20) > 0;
}

async function isPngCoverBroken(coverUrl) {
  if (!isPngCoverUrl(coverUrl) || !coverUrl.trim()) return false;

  let response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    response = await fetch(coverUrl, {
      signal: controller.signal,
      headers: {
        Accept: "image/png,image/*",
        "User-Agent": "BookWalker/1.0 (cover-validator)",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);
  } catch {
    return true;
  }

  if (!response.ok) return true;

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) return true;

  const isPng = contentType.includes("image/png") || isPngSignature(buffer);
  if (!isPng) return true;

  return !hasValidPngImageData(buffer);
}

async function scanBooks(books, concurrency, onProgress) {
  const results = new Array(books.length);
  let index = 0;
  let done = 0;

  async function worker() {
    while (index < books.length) {
      const i = index++;
      const book = books[i];
      if (!isPngCoverUrl(book.coverUrl)) {
        results[i] = { id: book.id, corrupted: false, skipped: true };
      } else {
        results[i] = {
          id: book.id,
          corrupted: await isPngCoverBroken(book.coverUrl),
          skipped: false,
        };
      }
      done += 1;
      onProgress?.(done, books.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, books.length) }, worker),
  );
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let books = await prisma.book.findMany({
    select: { id: true, coverUrl: true },
    orderBy: { title: "asc" },
  });

  if (args.limit != null && Number.isFinite(args.limit)) {
    books = books.slice(0, args.limit);
  }

  const pngCount = books.filter((b) => isPngCoverUrl(b.coverUrl)).length;

  console.log(`Total books: ${books.length}`);
  console.log(`PNG covers to scan: ${pngCount}`);
  console.log(`Non-PNG (skipped, marked OK): ${books.length - pngCount}`);

  if (pngCount === 0) {
    console.log("No PNG covers found.");
    return;
  }

  let lastLog = 0;
  const results = await scanBooks(books, args.concurrency, (done, total) => {
    if (done - lastLog >= 50 || done === total) {
      console.log(`  Scanned ${done}/${total}`);
      lastLog = done;
    }
  });

  const scanned = results.filter((r) => !r.skipped);
  const corrupted = scanned.filter((r) => r.corrupted);

  console.log(`\nResults: ${scanned.length - corrupted.length} OK, ${corrupted.length} corrupted`);

  if (args.dryRun) {
    console.log("Dry run — no database updates.");
    return;
  }

  const batchSize = 100;
  for (let i = 0; i < results.length; i += batchSize) {
    const batch = results.slice(i, i + batchSize);
    await Promise.all(
      batch.map((r) =>
        prisma.book.update({
          where: { id: r.id },
          data: { coverCorrupted: r.corrupted },
        }),
      ),
    );
    console.log(`Updated ${Math.min(i + batchSize, results.length)}/${results.length}`);
  }

  console.log(`\nDone. ${corrupted.length} books hidden from store (corrupted PNG).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
