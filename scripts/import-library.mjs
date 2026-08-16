/**
 * Import a parsed Mihon/Tachiyomi library into the sole user's Book Walker library.
 *
 * Prerequisites:
 *   py scripts/parse-tachibk.py path/to/backup.tachibk --market scripts/tachibk-market.json
 *
 * Usage:
 *   node scripts/import-library.mjs
 *   node scripts/import-library.mjs --dry-run
 *   node scripts/import-library.mjs --categories-only
 *   node scripts/import-library.mjs --file scripts/tachibk-market.json
 */

import { existsSync, readFileSync } from "node:fs";
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
  const args = { dryRun: false, file: null, categoriesOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--categories-only") args.categoriesOnly = true;
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

function normalizeTitle(title) {
  return title.trim().toLowerCase();
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

function categoryNames(entry) {
  return realCategoryNames(entry).map((c) => c.toLowerCase());
}

function realCategoryNames(entry) {
  return [
    ...new Set(
      (entry.categoryNames ?? [])
        .map((c) => String(c).trim())
        .filter((c) => c && c !== "0"),
    ),
  ];
}

function libraryCategorySlug(name) {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) return "collection";
  if (slug === "uncategorized") return "uncategorized-collection";
  return slug;
}

function loadMihonCategories() {
  const libraryFile = resolve(__dirname, "tachibk-library.json");
  if (!existsSync(libraryFile)) return [];
  const data = JSON.parse(readFileSync(libraryFile, "utf8"));
  return (data.categories ?? [])
    .filter((c) => c?.name && String(c.name).trim() && String(c.name) !== "0")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((c, index) => ({
      name: String(c.name).trim(),
      sortOrder: Number.isInteger(c.order) ? c.order : index,
    }));
}

function publicationStatusFromBook(b) {
  let status = mapTachiyomiStatus(b.tachiyomiStatus);
  const names = categoryNames(b);
  if (status === "UNKNOWN") {
    if (names.includes("completed") || names.includes("completed series")) {
      status = "COMPLETED";
    } else if (names.includes("ongoing series") || names.includes("airing")) {
      status = "ONGOING";
    } else if (names.includes("not updating")) {
      status = "HIATUS";
    }
  }
  return status;
}

function isOngoingPublication(status) {
  return status === "ONGOING" || status === "HIATUS";
}

function pickBetterEntry(a, b) {
  const score = (entry) => {
    const read = entry.chaptersRead ?? 0;
    const chapters = entry.totalPages ?? 0;
    const mangadex = entry.sourceName === "MangaDex" ? 1 : 0;
    const hasUrl = entry.sourceUrl ? 1 : 0;
    return [read, chapters, mangadex, hasUrl];
  };
  const sa = score(a);
  const sb = score(b);
  let winner = a;
  for (let i = 0; i < sa.length; i++) {
    if (sb[i] !== sa[i]) {
      winner = sb[i] > sa[i] ? b : a;
      break;
    }
  }
  return {
    ...winner,
    categoryNames: [...new Set([...realCategoryNames(a), ...realCategoryNames(b)])],
    dateAdded: earliestDateAdded(a.dateAdded, b.dateAdded),
  };
}

/** Mihon stores dateAdded as epoch milliseconds (sometimes seconds). */
function parseEpoch(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n < 1e12 ? n * 1000 : n;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  if (year < 2008 || date.getTime() > Date.now() + 86_400_000) return null;
  return date;
}

function earliestDateAdded(a, b) {
  const left = parseEpoch(a);
  const right = parseEpoch(b);
  if (left && right) return Math.min(left.getTime(), right.getTime());
  if (left) return left.getTime();
  if (right) return right.getTime();
  return a ?? b ?? 0;
}

function dedupeByTitle(entries) {
  const byTitle = new Map();
  for (const entry of entries) {
    const key = normalizeTitle(entry.title);
    const existing = byTitle.get(key);
    byTitle.set(key, existing ? pickBetterEntry(existing, entry) : entry);
  }
  return [...byTitle.values()];
}

function readingStatus(entry, publicationStatus) {
  const names = categoryNames(entry);
  const read = Math.max(0, entry.chaptersRead ?? 0);
  const total = Math.max(entry.totalPages ?? 0, 1);
  const caughtUp = read > 0 && read >= total;

  if (names.includes("dropped")) {
    if (caughtUp && !isOngoingPublication(publicationStatus)) return "COMPLETED";
    return read > 0 ? "READING" : "PLAN_TO_READ";
  }

  if (caughtUp && !isOngoingPublication(publicationStatus)) return "COMPLETED";
  if (read > 0) return "READING";
  return "PLAN_TO_READ";
}

function pickCatalogMatch(candidates, entry) {
  if (!candidates.length) return null;
  const ranked = [...candidates].sort((a, b) => {
    const score = (book) => {
      const sameSource =
        entry.sourceName && book.sourceName === entry.sourceName ? 2 : 0;
      const mangadex = book.sourceName === "MangaDex" ? 1 : 0;
      const manga = book.category === "MANGA" ? 1 : 0;
      return sameSource + mangadex + manga;
    };
    return score(b) - score(a);
  });
  return ranked[0];
}

async function syncLibraryCategories(user, entries) {
  const defined = loadMihonCategories();
  const namesFromEntries = new Set();
  for (const entry of entries) {
    for (const name of realCategoryNames(entry)) namesFromEntries.add(name);
  }

  const categories = [...defined];
  const seen = new Set(categories.map((c) => c.name.toLowerCase()));
  for (const name of namesFromEntries) {
    if (!seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      categories.push({ name, sortOrder: categories.length });
    }
  }

  if (!categories.length) {
    console.log("No Mihon categories to import");
    return;
  }

  const slugCounts = new Map();
  const records = categories.map((cat) => {
    let slug = libraryCategorySlug(cat.name);
    const count = (slugCounts.get(slug) ?? 0) + 1;
    slugCounts.set(slug, count);
    if (count > 1) slug = `${slug}-${count}`;
    return {
      userId: user.id,
      name: cat.name.slice(0, 80),
      slug,
      sortOrder: cat.sortOrder,
    };
  });

  await prisma.libraryCategory.deleteMany({ where: { userId: user.id } });
  await prisma.libraryCategory.createMany({ data: records });

  const created = await prisma.libraryCategory.findMany({
    where: { userId: user.id },
  });
  const idByName = new Map(created.map((c) => [c.name.toLowerCase(), c.id]));

  const userBooks = await prisma.userBook.findMany({
    where: { userId: user.id },
    select: { id: true, book: { select: { title: true } } },
  });
  const userBookByTitle = new Map(
    userBooks.map((ub) => [normalizeTitle(ub.book.title), ub.id]),
  );

  const joins = [];
  const seenJoin = new Set();
  for (const entry of entries) {
    const userBookId = userBookByTitle.get(normalizeTitle(entry.title));
    if (!userBookId) continue;
    for (const name of realCategoryNames(entry)) {
      const categoryId = idByName.get(name.toLowerCase());
      if (!categoryId) continue;
      const key = `${userBookId}:${categoryId}`;
      if (seenJoin.has(key)) continue;
      seenJoin.add(key);
      joins.push({ userBookId, categoryId });
    }
  }

  if (joins.length) {
    await prisma.userBookCategory.createMany({ data: joins });
  }

  const assignedTitles = new Set(joins.map((j) => j.userBookId)).size;
  console.log(
    `Collections: ${created.map((c) => c.name).join(", ")}`,
  );
  console.log(
    `Assigned ${joins.length} category links on ${assignedTitles} titles`,
  );
}

function toBookCreate(entry) {
  return {
    title: entry.title.slice(0, 200),
    summary: (entry.summary || `Imported from Mihon (${entry.sourceName ?? "unknown"}).`).slice(
      0,
      5000,
    ),
    coverUrl: entry.coverUrl,
    totalPages: Math.max(entry.totalPages ?? 1, 1),
    category: "MANGA",
    artist: entry.artist ?? null,
    author: entry.author ?? null,
    genres: Array.isArray(entry.genre) ? entry.genre.slice(0, 20) : [],
    sourceName: entry.sourceName ?? null,
    sourceUrl: entry.sourceUrl ?? null,
    publicationStatus: publicationStatusFromBook(entry),
    isAdult: classifyAdult(entry.sourceName, entry.genre),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = resolve(__dirname, args.file ?? "tachibk-market.json");

  const raw = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(raw)) {
    throw new Error("Market JSON must be an array of books");
  }

  const entries = dedupeByTitle(
    raw.filter(
      (b) => typeof b.title === "string" && b.title.trim() && Number.isInteger(b.totalPages),
    ),
  );

  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true },
  });
  if (users.length === 0) {
    throw new Error("No users found");
  }
  if (users.length > 1) {
    throw new Error(
      `Expected exactly one user, found ${users.length}: ${users
        .map((u) => u.email ?? u.id)
        .join(", ")}`,
    );
  }
  const user = users[0];
  console.log(`Target user: ${user.name ?? "unnamed"} <${user.email ?? user.id}>`);
  console.log(`Mihon titles (deduped): ${entries.length}`);

  const catalog = await prisma.book.findMany({
    select: {
      id: true,
      title: true,
      totalPages: true,
      publicationStatus: true,
      sourceName: true,
      sourceUrl: true,
      category: true,
    },
  });
  const catalogByTitle = new Map();
  for (const book of catalog) {
    const key = normalizeTitle(book.title);
    const list = catalogByTitle.get(key) ?? [];
    list.push(book);
    catalogByTitle.set(key, list);
  }

  const toCreate = [];
  const matched = [];
  const skipped = [];

  for (const entry of entries) {
    const existing = pickCatalogMatch(
      catalogByTitle.get(normalizeTitle(entry.title)) ?? [],
      entry,
    );
    if (existing) {
      matched.push({ entry, book: existing });
      continue;
    }
    if (!isValidHttpUrl(entry.coverUrl) || !entry.summary?.trim()) {
      skipped.push(entry.title);
      continue;
    }
    toCreate.push(entry);
  }

  console.log(`Already in catalog: ${matched.length}`);
  console.log(`New catalog books: ${toCreate.length}`);
  if (skipped.length) {
    console.log(`Skipped (missing cover/summary): ${skipped.length}`);
    for (const title of skipped.slice(0, 10)) {
      console.log(`  - ${title}`);
    }
  }

  const statusCounts = { READING: 0, COMPLETED: 0, PLAN_TO_READ: 0 };
  const preview = [...matched, ...toCreate.map((entry) => ({ entry, book: null }))].slice(
    0,
    12,
  );
  for (const { entry } of [...matched, ...toCreate.map((e) => ({ entry: e }))]) {
    const pub = publicationStatusFromBook(entry);
    statusCounts[readingStatus(entry, pub)] += 1;
  }

  console.log("Reading status:", statusCounts);

  const collectionCounts = {};
  let uncategorized = 0;
  for (const entry of entries) {
    const names = realCategoryNames(entry);
    if (!names.length) uncategorized += 1;
    for (const name of names) {
      collectionCounts[name] = (collectionCounts[name] ?? 0) + 1;
    }
  }
  console.log("Mihon collections:", {
    ...collectionCounts,
    ...(uncategorized ? { Uncategorized: uncategorized } : {}),
  });

  if (args.dryRun) {
    console.log("\nDry run — sample:");
    for (const { entry, book } of preview) {
      const pub = publicationStatusFromBook(entry);
      const names = realCategoryNames(entry);
      console.log(
        `- ${book ? "match" : "create"} ${entry.title} (${entry.chaptersRead ?? 0}/${entry.totalPages} → ${readingStatus(entry, pub)}; ${names.join(", ") || "uncategorized"})`,
      );
    }
    return;
  }

  if (args.categoriesOnly) {
    await syncLibraryCategories(user, entries);
    return;
  }

  const createdIdsByTitle = new Map();
  const batchSize = 100;
  let createdCount = 0;
  for (let i = 0; i < toCreate.length; i += batchSize) {
    const batch = toCreate.slice(i, i + batchSize).map(toBookCreate);
    await prisma.book.createMany({ data: batch });
    createdCount += batch.length;
    console.log(`Created catalog books ${createdCount}/${toCreate.length}`);
  }

  if (toCreate.length) {
    const created = await prisma.book.findMany({
      where: {
        title: { in: toCreate.map((e) => e.title.slice(0, 200)) },
        category: "MANGA",
      },
      select: { id: true, title: true },
    });
    const wanted = new Set(toCreate.map((e) => normalizeTitle(e.title)));
    for (const book of created) {
      const key = normalizeTitle(book.title);
      if (wanted.has(key) && !createdIdsByTitle.has(key)) {
        createdIdsByTitle.set(key, book.id);
      }
    }
  }

  const libraryRows = [];
  const catalogUpdates = [];

  for (const { entry, book } of matched) {
    const publicationStatus = book.publicationStatus ?? publicationStatusFromBook(entry);
    const totalPages = Math.max(book.totalPages, entry.totalPages ?? 1, entry.chaptersRead ?? 0, 1);
    const currentPage = Math.min(Math.max(entry.chaptersRead ?? 0, 0), totalPages);
    const addedAt = parseEpoch(entry.dateAdded);
    libraryRows.push({
      userId: user.id,
      bookId: book.id,
      currentPage,
      status: readingStatus(entry, publicationStatus),
      ...(addedAt ? { addedAt } : {}),
    });

    const data = {};
    if (totalPages > book.totalPages) data.totalPages = totalPages;
    if (!book.sourceUrl && entry.sourceUrl) data.sourceUrl = entry.sourceUrl;
    if (!book.sourceName && entry.sourceName) data.sourceName = entry.sourceName;
    if (Object.keys(data).length) {
      catalogUpdates.push({ id: book.id, data });
    }
  }

  for (const entry of toCreate) {
    const bookId = createdIdsByTitle.get(normalizeTitle(entry.title));
    if (!bookId) {
      skipped.push(entry.title);
      continue;
    }
    const publicationStatus = publicationStatusFromBook(entry);
    const totalPages = Math.max(entry.totalPages ?? 1, 1);
    const addedAt = parseEpoch(entry.dateAdded);
    libraryRows.push({
      userId: user.id,
      bookId,
      currentPage: Math.min(Math.max(entry.chaptersRead ?? 0, 0), totalPages),
      status: readingStatus(entry, publicationStatus),
      ...(addedAt ? { addedAt } : {}),
    });
  }

  for (let i = 0; i < catalogUpdates.length; i += batchSize) {
    const batch = catalogUpdates.slice(i, i + batchSize);
    await Promise.all(
      batch.map((row) => prisma.book.update({ where: { id: row.id }, data: row.data })),
    );
    console.log(
      `Updated catalog metadata ${Math.min(i + batch.length, catalogUpdates.length)}/${catalogUpdates.length}`,
    );
  }

  let upserted = 0;
  for (let i = 0; i < libraryRows.length; i += batchSize) {
    const batch = libraryRows.slice(i, i + batchSize);
    await Promise.all(
      batch.map((row) =>
        prisma.userBook.upsert({
          where: {
            userId_bookId: { userId: row.userId, bookId: row.bookId },
          },
          create: {
            userId: row.userId,
            bookId: row.bookId,
            currentPage: row.currentPage,
            status: row.status,
            addedAt: row.addedAt ?? new Date(),
          },
          // Progress can refresh; addedAt is kept unless a later backfill
          // finds an earlier Mihon dateAdded.
          update: {
            currentPage: row.currentPage,
            status: row.status,
          },
        }),
      ),
    );
    upserted += batch.length;
    console.log(`Imported library rows ${upserted}/${libraryRows.length}`);
  }

  const datedRows = libraryRows.filter((row) => row.addedAt);
  if (datedRows.length) {
    let restored = 0;
    for (let i = 0; i < datedRows.length; i += batchSize) {
      const batch = datedRows.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map((row) =>
          prisma.userBook.updateMany({
            where: {
              userId: row.userId,
              bookId: row.bookId,
              addedAt: { gt: row.addedAt },
            },
            data: { addedAt: row.addedAt },
          }),
        ),
      );
      restored += results.reduce((sum, result) => sum + result.count, 0);
    }
    console.log(
      `Restored earlier Mihon date-added on ${restored} existing library rows`,
    );
  }

  const finalCount = await prisma.userBook.count({ where: { userId: user.id } });
  await syncLibraryCategories(user, entries);
  console.log(`\nDone. ${user.name ?? user.email} now has ${finalCount} titles in their library.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
