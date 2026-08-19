/**
 * Import general books (BOOK category) from Open Library.
 *
 * Usage:
 *   node scripts/import-books.mjs
 *   node scripts/import-books.mjs --limit 5000
 *   node scripts/import-books.mjs --dry-run
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const OPEN_LIBRARY_URL = "https://openlibrary.org/search.json";

const ADULT_GENRE_TAGS = new Set(
  ["adult", "erotica", "pornography", "sex"].map((g) => g.toLowerCase()),
);

/** Subject searches — each pulls rated titles with covers. */
const SUBJECT_QUERIES = [
  "subject:fiction",
  "subject:science_fiction",
  "subject:fantasy",
  "subject:mystery_and_detective_stories",
  "subject:romance",
  "subject:thriller",
  "subject:biography",
  "subject:history",
  "subject:young_adult_fiction",
  "subject:horror",
  "subject:adventure",
  "subject:classic_literature",
  "subject:poetry",
  "subject:philosophy",
  "subject:self-help",
];

const FIELDS =
  "key,title,author_name,first_sentence,cover_i,ratings_average,ratings_count,number_of_pages_median,subject,first_publish_year";

function parseArgs(argv) {
  const args = { dryRun: false, limit: 5000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--limit") args.limit = Number(argv[++i]);
  }
  return args;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function classifyAdult(genres) {
  if (!genres?.length) return false;
  return genres.some((g) => ADULT_GENRE_TAGS.has(g.toLowerCase()));
}

function mapOpenLibraryDoc(doc) {
  const title = doc.title?.trim();
  const coverUrl = doc.cover_i
    ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
    : null;
  const authors = doc.author_name ?? [];
  const summary =
    (doc.first_sentence
      ? Array.isArray(doc.first_sentence)
        ? doc.first_sentence.join(" ")
        : doc.first_sentence
      : "") ||
    `Popular book${authors.length ? ` by ${authors.join(", ")}` : ""}. Imported from Open Library.`;

  if (!title || !coverUrl || !isValidHttpUrl(coverUrl)) return null;

  const genres = (doc.subject ?? []).slice(0, 20).map(String);
  const popularity =
    Math.round((doc.ratings_average ?? 0) * 1000) + (doc.ratings_count ?? 0);

  return {
    title: title.slice(0, 200),
    summary: summary.slice(0, 5000),
    coverUrl,
    totalPages: doc.number_of_pages_median || 300,
    category: "BOOK",
    artist: null,
    author: authors[0]?.slice(0, 200) ?? null,
    genres,
    sourceName: "Open Library",
    isAdult: classifyAdult(genres),
    popularity,
    externalKey: `openlibrary:${doc.key}`,
  };
}

async function fetchSubject(subject, maxPerSubject) {
  const perPage = 100;
  const results = [];
  let offset = 0;

  while (results.length < maxPerSubject && offset < 10000) {
    const params = new URLSearchParams({
      q: subject,
      sort: "rating",
      limit: String(perPage),
      offset: String(offset),
      fields: FIELDS,
    });

    let json;
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch(`${OPEN_LIBRARY_URL}?${params}`);
      if (res.status >= 500) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (!res.ok) throw new Error(`Open Library HTTP ${res.status} for ${subject}`);
      json = await res.json();
      break;
    }
    if (!json) break;

    const docs = json.docs ?? [];
    for (const doc of docs) {
      const mapped = mapOpenLibraryDoc(doc);
      if (mapped) results.push(mapped);
    }

    console.log(`  ${subject} @${offset}: ${results.length} valid`);
    if (docs.length < perPage) break;
    offset += perPage;
    await sleep(350);
  }

  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = Number.isFinite(args.limit) ? args.limit : 5000;
  const perSubject = Math.ceil((target * 1.5) / SUBJECT_QUERIES.length);

  console.log(`Fetching books from Open Library (target: ${target} new)...\n`);

  const all = [];
  for (const subject of SUBJECT_QUERIES) {
    console.log(`Query: ${subject}`);
    const batch = await fetchSubject(subject, perSubject);
    all.push(...batch);
  }

  const seen = new Set();
  const unique = [];
  for (const book of all.sort((a, b) => b.popularity - a.popularity)) {
    if (seen.has(book.externalKey)) continue;
    seen.add(book.externalKey);
    unique.push(book);
  }

  console.log(`\nFetched ${all.length} candidates, ${unique.length} unique`);

  const existing = await prisma.book.findMany({
    where: { category: "BOOK" },
    select: { title: true },
  });
  const existingTitles = new Set(existing.map((b) => b.title.toLowerCase()));
  const bookCount = existingTitles.size;
  console.log(`Catalog has ${bookCount} BOOK titles`);

  const toInsert = [];
  for (const book of unique) {
    if (toInsert.length >= target) break;
    if (existingTitles.has(book.title.toLowerCase())) continue;
    toInsert.push(book);
    existingTitles.add(book.title.toLowerCase());
  }

  console.log(`\nTo insert: ${toInsert.length} BOOK titles`);

  if (args.dryRun) {
    console.log("\nDry run — first 15:");
    for (const b of toInsert.slice(0, 15)) {
      console.log(`- ${b.title} by ${b.author ?? "?"}`);
    }
    return;
  }

  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += batchSize) {
    const batch = toInsert.slice(i, i + batchSize).map((b) => ({
      title: b.title,
      summary: b.summary,
      coverUrl: b.coverUrl,
      totalPages: b.totalPages,
      category: "BOOK",
      artist: b.artist,
      author: b.author,
      genres: b.genres,
      sourceName: b.sourceName,
      isAdult: b.isAdult,
    }));
    const result = await prisma.book.createMany({ data: batch });
    inserted += result.count;
    console.log(`Inserted ${inserted}/${toInsert.length}`);
  }

  const finalBookCount = await prisma.book.count({ where: { category: "BOOK" } });
  console.log(
    `\nDone. Inserted ${inserted} books. BOOK category now has ${finalBookCount} titles.`,
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
