/**
 * Import popular titles into the Book Walker marketplace.
 *
 * Sources:
 *   - AniList (manga / manhwa / light novels) — sorted by popularity
 *   - Open Library (general books) — sorted by rating
 *
 * Usage:
 *   node scripts/import-popular.mjs
 *   node scripts/import-popular.mjs --dry-run
 *   node scripts/import-popular.mjs --limit 5000
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

const prisma = new PrismaClient();

const ANILIST_URL = "https://graphql.anilist.co";
const OPEN_LIBRARY_URL = "https://openlibrary.org/search.json";

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
  ["adult", "hentai", "pornographic", "smut", "sexual violence", "erotica", "hentai"].map(
    (g) => g.toLowerCase(),
  ),
);

const TARGET_SPLIT = {
  MANGA: 3000,
  LIGHT_NOVEL: 1000,
  BOOK: 1000,
};

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
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function classifyAdult(sourceName, genres) {
  if (sourceName) {
    const normalized = sourceName.toLowerCase();
    if (ADULT_SOURCE_PATTERNS.some((p) => normalized.includes(p))) return true;
  }
  if (genres?.length) {
    if (genres.some((g) => ADULT_GENRE_TAGS.has(g.toLowerCase()))) return true;
  }
  return false;
}

function pickTitle(title) {
  return (title.english || title.romaji || title.native || "").trim();
}

async function anilistQuery(query, variables, attempt = 0) {
  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 429) {
    if (attempt >= 8) throw new Error("AniList rate limit exceeded");
    const waitMs = 2000 * 2 ** attempt;
    console.log(`  AniList rate limited — waiting ${waitMs}ms`);
    await sleep(waitMs);
    return anilistQuery(query, variables, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`AniList HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  return json.data;
}

const MANGA_QUERY = `
  query ($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      media(
        type: MANGA
        sort: POPULARITY_DESC
        isAdult: false
        format_in: [MANGA, ONE_SHOT]
      ) {
        id
        popularity
        title { romaji english native }
        description(asHtml: false)
        coverImage { large }
        chapters
        volumes
        status
        genres
        format
        staff(perPage: 5) {
          edges {
            role
            node { name { full } }
          }
        }
      }
    }
  }
`;

const NOVEL_QUERY = `
  query ($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      media(
        type: MANGA
        sort: POPULARITY_DESC
        isAdult: false
        format: NOVEL
      ) {
        id
        popularity
        title { romaji english native }
        description(asHtml: false)
        coverImage { large }
        chapters
        volumes
        status
        genres
        format
        staff(perPage: 5) {
          edges {
            role
            node { name { full } }
          }
        }
      }
    }
  }
`;

function mapAnilistStatus(status) {
  switch (status) {
    case "RELEASING":
      return "ONGOING";
    case "FINISHED":
      return "COMPLETED";
    case "HIATUS":
      return "HIATUS";
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "UNKNOWN";
  }
}

function mapAnilistMedia(media, category) {
  const title = pickTitle(media.title);
  const coverUrl = media.coverImage?.large;
  const summary = stripHtml(media.description);
  const totalPages = media.chapters || media.volumes || 1;
  const genres = media.genres ?? [];

  const author = media.staff?.edges
    ?.find((e) => /story|author/i.test(e.role))
    ?.node?.name?.full;
  const artist = media.staff?.edges
    ?.find((e) => /art/i.test(e.role))
    ?.node?.name?.full;

  if (!title || !coverUrl || !summary || !isValidHttpUrl(coverUrl)) return null;

  return {
    title: title.slice(0, 200),
    summary: summary.slice(0, 5000),
    coverUrl,
    totalPages: Math.max(totalPages, 1),
    category,
    artist: artist ?? null,
    author: author ?? null,
    genres: genres.slice(0, 20),
    sourceName: "AniList",
    sourceUrl: `https://anilist.co/manga/${media.id}`,
    externalId: `anilist:${media.id}`,
    publicationStatus: mapAnilistStatus(media.status),
    isAdult: classifyAdult("AniList", genres),
    popularity: media.popularity ?? 0,
    externalKey: `anilist:${media.id}`,
  };
}

async function fetchAnilistCategory(query, category, targetCount) {
  const perPage = 50;
  const results = [];
  let page = 1;

  while (results.length < targetCount * 1.5 && page <= 120) {
    const data = await anilistQuery(query, { page, perPage });
    const media = data.Page.media ?? [];
    for (const item of media) {
      const mapped = mapAnilistMedia(item, category);
      if (mapped) results.push(mapped);
    }
    console.log(`  AniList ${category} page ${page}: ${results.length} valid so far`);
    if (!data.Page.pageInfo.hasNextPage) break;
    page += 1;
    await sleep(1200);
  }

  return results.slice(0, targetCount * 1.5);
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
  const year = doc.first_publish_year;

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
    isAdult: classifyAdult("Open Library", genres),
    popularity: Math.round((doc.ratings_average ?? 0) * 1000) + (doc.ratings_count ?? 0),
    externalKey: `openlibrary:${doc.key}`,
    publishYear: year,
  };
}

async function fetchOpenLibraryBooks(targetCount) {
  const perPage = 100;
  const results = [];
  let offset = 0;

  while (results.length < targetCount * 1.5 && offset < 15000) {
    const params = new URLSearchParams({
      q: "fiction",
      sort: "rating",
      limit: String(perPage),
      offset: String(offset),
      fields:
        "key,title,author_name,first_sentence,cover_i,ratings_average,ratings_count,number_of_pages_median,subject,first_publish_year",
    });

    let json;
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await fetch(`${OPEN_LIBRARY_URL}?${params}`);
      if (res.status >= 500) {
        const waitMs = 1000 * 2 ** attempt;
        console.log(`  Open Library HTTP ${res.status} — retry in ${waitMs}ms`);
        await sleep(waitMs);
        continue;
      }
      if (!res.ok) throw new Error(`Open Library HTTP ${res.status}`);
      json = await res.json();
      break;
    }
    if (!json) throw new Error("Open Library unavailable after retries");

    const docs = json.docs ?? [];

    for (const doc of docs) {
      const mapped = mapOpenLibraryDoc(doc);
      if (mapped) results.push(mapped);
    }

    console.log(`  Open Library offset ${offset}: ${results.length} valid so far`);
    if (docs.length < perPage) break;
    offset += perPage;
    await sleep(400);
  }

  return results.slice(0, targetCount * 1.5);
}

function dedupeCandidates(books) {
  const seen = new Set();
  const out = [];
  for (const book of books) {
    const key = book.externalKey ?? book.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(book);
  }
  return out.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const totalLimit = Number.isFinite(args.limit) ? args.limit : 5000;

  console.log(`Fetching popular titles (target: ${totalLimit} new inserts)...\n`);

  console.log("Fetching AniList manga...");
  const manga = await fetchAnilistCategory(MANGA_QUERY, "MANGA", TARGET_SPLIT.MANGA);
  console.log("Fetching AniList light novels...");
  const novels = await fetchAnilistCategory(
    NOVEL_QUERY,
    "LIGHT_NOVEL",
    TARGET_SPLIT.LIGHT_NOVEL,
  );
  console.log("Fetching Open Library books...");
  const books = await fetchOpenLibraryBooks(TARGET_SPLIT.BOOK);

  console.log(`\nFetched candidates: ${manga.length} manga, ${novels.length} LN, ${books.length} books`);

  const merged = dedupeCandidates([...manga, ...novels, ...books]);
  console.log(`After dedupe: ${merged.length} unique candidates`);

  const existing = await prisma.book.findMany({ select: { title: true } });
  const existingTitles = new Set(existing.map((b) => b.title.toLowerCase()));
  console.log(`Already in catalog: ${existingTitles.size} titles`);

  const toInsert = [];
  const categoryCounts = { MANGA: 0, LIGHT_NOVEL: 0, BOOK: 0 };

  for (const book of merged) {
    if (toInsert.length >= totalLimit) break;
    if (existingTitles.has(book.title.toLowerCase())) continue;
    if (categoryCounts[book.category] >= TARGET_SPLIT[book.category]) continue;

    toInsert.push(book);
    categoryCounts[book.category] += 1;
    existingTitles.add(book.title.toLowerCase());
  }

  console.log(`\nTo insert: ${toInsert.length}`);
  console.log("By category:", categoryCounts);

  if (args.dryRun) {
    console.log("\nDry run — first 15:");
    for (const b of toInsert.slice(0, 15)) {
      console.log(`- [${b.category}] ${b.title} (pop ${b.popularity})`);
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
      category: b.category,
      artist: b.artist,
      author: b.author,
      genres: b.genres,
      sourceName: b.sourceName,
      sourceUrl: b.sourceUrl ?? null,
      externalId: b.externalId ?? null,
      publicationStatus: b.publicationStatus ?? "UNKNOWN",
      isAdult: b.isAdult,
    }));
    const result = await prisma.book.createMany({ data: batch });
    inserted += result.count;
    console.log(`Inserted ${inserted}/${toInsert.length}`);
  }

  const finalCount = await prisma.book.count();
  console.log(`\nDone. Inserted ${inserted} books. Catalog now has ${finalCount} titles.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
