/**
 * Reload covers for titles with missing or broken art.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/repair-covers.mts
 *   npx tsx --env-file=.env scripts/repair-covers.mts --library
 *   npx tsx --env-file=.env scripts/repair-covers.mts --limit 20
 */

import { coverImageLoads } from "../src/lib/cover-validation";
import { prisma } from "../src/lib/prisma";
import { repairBookCover } from "../src/lib/sources/repair-cover";

const BROKEN_COVER_HOSTS = [
  "asuratoon.com",
  "img.asuracomics.com",
  "imgcdnlevel1.company",
];

const SCAN_CONCURRENCY = 8;

type BookCoverRef = {
  id: string;
  title: string;
  category: import("@prisma/client").BookCategory;
  coverUrl: string;
  coverCorrupted: boolean;
  sourceName: string | null;
  sourceUrl: string | null;
};

function parseArgs(argv: string[]) {
  const args = { limit: Number.POSITIVE_INFINITY, library: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") args.limit = Number(argv[++i]);
    else if (argv[i] === "--library") args.library = true;
  }
  return args;
}

function looksBroken(book: BookCoverRef): boolean {
  if (book.coverCorrupted || !book.coverUrl.trim()) return true;
  return BROKEN_COVER_HOSTS.some((host) => book.coverUrl.includes(host));
}

async function scanUnverified(
  books: BookCoverRef[],
  onProgress?: (done: number, total: number) => void,
): Promise<BookCoverRef[]> {
  const broken: BookCoverRef[] = [];
  let index = 0;
  let done = 0;

  async function worker() {
    while (index < books.length) {
      const i = index++;
      const book = books[i]!;
      const ok = await coverImageLoads(book.coverUrl);
      if (!ok) broken.push(book);
      done += 1;
      onProgress?.(done, books.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(SCAN_CONCURRENCY, books.length) }, worker),
  );
  return broken;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const libraryFilter = args.library ? { userBooks: { some: {} } } : {};

  const books = await prisma.book.findMany({
    where: libraryFilter,
    orderBy: { updatedAt: "asc" },
    select: {
      id: true,
      title: true,
      category: true,
      coverUrl: true,
      coverCorrupted: true,
      sourceName: true,
      sourceUrl: true,
    },
  });

  const flagged = books.filter(looksBroken);
  const unverified = books.filter((book) => !looksBroken(book));

  console.log(
    args.library
      ? `Library titles: ${books.length}`
      : `Catalog titles to consider: ${books.length}`,
  );
  console.log(`Already flagged missing/broken: ${flagged.length}`);

  let scannedBroken: BookCoverRef[] = [];
  if (args.library && unverified.length > 0) {
    console.log(`Checking ${unverified.length} library covers…`);
    let lastLog = 0;
    scannedBroken = await scanUnverified(unverified, (done, total) => {
      if (done - lastLog >= 100 || done === total) {
        console.log(`  Scanned ${done}/${total}`);
        lastLog = done;
      }
    });
    console.log(`Covers that failed to load: ${scannedBroken.length}`);
  }

  const seen = new Set<string>();
  const queue = [...flagged, ...scannedBroken].filter((book) => {
    if (seen.has(book.id)) return false;
    seen.add(book.id);
    return true;
  });

  const limited =
    Number.isFinite(args.limit) && args.limit > 0
      ? queue.slice(0, args.limit)
      : queue;

  console.log(`Processing: ${limited.length}`);

  let repaired = 0;
  let reloaded = 0;
  let assigned = 0;
  let failed = 0;

  for (let i = 0; i < limited.length; i++) {
    const book = limited[i]!;
    process.stdout.write(`  [${i + 1}/${limited.length}] ${book.title} … `);
    try {
      const outcome = await repairBookCover(book);
      if (outcome.repaired) {
        repaired += 1;
        console.log(`replaced (${outcome.sourceName ?? "source"})`);
      } else if (outcome.reloaded) {
        reloaded += 1;
        console.log("existing cover loads");
      } else {
        failed += 1;
        console.log(outcome.error ?? "still missing");
      }
      if (outcome.sourceAssigned) assigned += 1;
    } catch (error) {
      failed += 1;
      console.log(error instanceof Error ? error.message : "error");
    }
  }

  console.log(
    `\nDone. replaced ${repaired}, reloaded ${reloaded}, assigned ${assigned} source(s), ${failed} still missing`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
