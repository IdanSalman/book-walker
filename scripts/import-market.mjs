/**
 * Import books from scripts/tachibk-market.json into the Book Walker catalog.
 *
 * Usage:
 *   node scripts/import-market.mjs
 *   node scripts/import-market.mjs --dry-run
 *   node scripts/import-market.mjs --limit 50
 *   node scripts/import-market.mjs --category "Completed"
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

const ADULT_SOURCE_PATTERNS = [
  "nhentai",
  "manhwa18",
  "manhwahentai",
  "coomer",
  "hentai",
  "18comic",
  "hitomi",
  "e-hentai",
  "exhentai",
];

const ADULT_GENRE_TAGS = new Set(
  ["adult", "hentai", "pornographic", "smut", "sexual violence", "erotica"].map(
    (g) => g.toLowerCase(),
  ),
);

function isAdultSource(sourceName) {
  if (!sourceName?.trim()) return false;
  const normalized = sourceName.toLowerCase();
  return ADULT_SOURCE_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function hasAdultGenre(genres) {
  if (!genres?.length) return false;
  return genres.some((genre) => ADULT_GENRE_TAGS.has(genre.toLowerCase()));
}

function classifyAdult(sourceName, genres) {
  return isAdultSource(sourceName) || hasAdultGenre(genres);
}

function parseArgs(argv) {
  const args = { dryRun: false, limit: null, category: null, file: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a === "--category") args.category = argv[++i];
    else if (a === "--file") args.file = argv[++i];
  }
  return args;
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function mapTachiyomiStatus(status) {
  switch (status) {
    case 1:
      return "ONGOING";
    case 2:
    case 3:
    case 4:
      return "COMPLETED";
    case 5:
      return "CANCELLED";
    case 6:
      return "HIATUS";
    default:
      return "UNKNOWN";
  }
}

function publicationStatusFromBook(b) {
  let status = mapTachiyomiStatus(b.tachiyomiStatus);
  if (status === "UNKNOWN" && b.categoryNames?.includes("Completed")) {
    status = "COMPLETED";
  }
  if (status === "UNKNOWN" && b.categoryNames?.includes("Ongoing")) {
    status = "ONGOING";
  }
  return status;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = resolve(
    __dirname,
    args.file ?? "tachibk-market.json",
  );

  let books = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(books)) {
    throw new Error("Market JSON must be an array of books");
  }

  if (args.category) {
    books = books.filter((b) =>
      (b.categoryNames ?? []).includes(args.category),
    );
  }

  books = books.filter(
    (b) =>
      typeof b.title === "string" &&
      b.title.trim() &&
      typeof b.summary === "string" &&
      b.summary.trim() &&
      isValidHttpUrl(b.coverUrl) &&
      Number.isInteger(b.totalPages) &&
      b.totalPages >= 1 &&
      b.category === "MANGA",
  );

  if (args.limit != null && Number.isFinite(args.limit)) {
    books = books.slice(0, args.limit);
  }

  // Skip titles already in the catalog (case-insensitive exact title match).
  const existing = await prisma.book.findMany({ select: { title: true } });
  const existingTitles = new Set(existing.map((b) => b.title.toLowerCase()));
  const toInsert = books.filter(
    (b) => !existingTitles.has(b.title.toLowerCase()),
  );
  const skipped = books.length - toInsert.length;

  console.log(`Candidates: ${books.length}`);
  console.log(`Already in catalog (skipped): ${skipped}`);
  console.log(`To insert: ${toInsert.length}`);

  if (args.dryRun) {
    console.log("\nDry run — first 10 would be:");
    for (const b of toInsert.slice(0, 10)) {
      console.log(`- ${b.title} (${b.totalPages} chapters, ${b.sourceName})`);
    }
    return;
  }

  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += batchSize) {
    const batch = toInsert.slice(i, i + batchSize).map((b) => ({
      title: b.title.slice(0, 200),
      summary: b.summary.slice(0, 5000),
      coverUrl: b.coverUrl,
      totalPages: b.totalPages,
      category: "MANGA",
      artist: b.artist ?? null,
      author: b.author ?? null,
      genres: Array.isArray(b.genre) ? b.genre.slice(0, 20) : [],
      sourceName: b.sourceName ?? null,
      sourceUrl: b.sourceUrl ?? null,
      publicationStatus: publicationStatusFromBook(b),
      isAdult: classifyAdult(b.sourceName, b.genre),
    }));
    const result = await prisma.book.createMany({ data: batch });
    inserted += result.count;
    console.log(`Inserted ${inserted}/${toInsert.length}`);
  }

  console.log(`Done. Inserted ${inserted} books into the market.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
