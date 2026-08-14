/**
 * Backfill sourceName and isAdult on books already imported from tachibk-market.json.
 *
 * Usage: node scripts/backfill-adult-flags.mjs
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

async function main() {
  const file = resolve(__dirname, "tachibk-market.json");
  const market = JSON.parse(readFileSync(file, "utf8"));
  const byTitle = new Map(
    market.map((b) => [b.title.toLowerCase(), b]),
  );

  const books = await prisma.book.findMany({
    select: { id: true, title: true },
  });

  let updated = 0;
  let adult = 0;
  const batchSize = 100;

  for (let i = 0; i < books.length; i += batchSize) {
    const batch = books.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (book) => {
        const entry = byTitle.get(book.title.toLowerCase());
        if (!entry) return;

        const isAdult = classifyAdult(entry.sourceName, entry.genre);
        if (isAdult) adult++;

        await prisma.book.update({
          where: { id: book.id },
          data: {
            sourceName: entry.sourceName ?? null,
            artist: entry.artist ?? null,
            author: entry.author ?? null,
            genres: Array.isArray(entry.genre) ? entry.genre.slice(0, 20) : [],
            isAdult,
          },
        });
        updated++;
      }),
    );
    console.log(`Updated ${Math.min(i + batchSize, books.length)}/${books.length}`);
  }

  console.log(`Done. Updated ${updated} books (${adult} marked adult).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
