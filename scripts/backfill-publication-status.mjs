/**
 * Backfill publication status, source URLs, and external IDs for manga.
 *
 * Sources:
 *   - AniList popular list (for sourceName = AniList)
 *   - scripts/tachibk-library.json (for Mihon-imported titles)
 *
 * Usage:
 *   node scripts/backfill-publication-status.mjs
 *   node scripts/backfill-publication-status.mjs --dry-run
 *   node scripts/backfill-publication-status.mjs --source anilist
 *   node scripts/backfill-publication-status.mjs --source mihon
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const ANILIST_URL = "https://graphql.anilist.co";

function parseArgs(argv) {
  const args = { dryRun: false, source: "all" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--source") args.source = argv[++i];
  }
  return args;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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

function normalizeTitle(title) {
  return title.trim().toLowerCase();
}

function mangaDexUrlFromPath(url) {
  if (!url) return null;
  const match = url.match(/\/manga\/([0-9a-f-]{36})/i);
  if (!match) return null;
  return `https://mangadex.org/title/${match[1]}`;
}

async function anilistQuery(query, variables, attempt = 0) {
  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 429) {
    if (attempt >= 8) throw new Error("AniList rate limit exceeded");
    await sleep(2000 * 2 ** attempt);
    return anilistQuery(query, variables, attempt + 1);
  }
  if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
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
      media(type: MANGA, sort: POPULARITY_DESC, isAdult: false) {
        id
        status
        chapters
        volumes
        title { romaji english native }
      }
    }
  }
`;

async function buildAnilistTitleMap() {
  const map = new Map();
  let page = 1;
  const perPage = 50;

  while (page <= 80) {
    const data = await anilistQuery(MANGA_QUERY, { page, perPage });
    const media = data.Page.media ?? [];
    for (const item of media) {
      const titles = [item.title.english, item.title.romaji, item.title.native]
        .filter(Boolean)
        .map((t) => normalizeTitle(t));
      const payload = {
        externalId: `anilist:${item.id}`,
        sourceUrl: `https://anilist.co/manga/${item.id}`,
        publicationStatus: mapAnilistStatus(item.status),
        totalPages: Math.max(item.chapters ?? item.volumes ?? 1, 1),
      };
      for (const title of titles) {
        if (!map.has(title)) map.set(title, payload);
      }
    }
    console.log(`  AniList page ${page}: ${map.size} title keys`);
    if (!data.Page.pageInfo.hasNextPage) break;
    page += 1;
    await sleep(1200);
  }

  return map;
}

function loadMihonTitleMap() {
  const file = resolve(__dirname, "tachibk-library.json");
  if (!existsSync(file)) {
    console.log("  No tachibk-library.json — skipping Mihon backfill");
    return new Map();
  }

  const data = JSON.parse(readFileSync(file, "utf8"));
  const manga = data.manga ?? [];
  const map = new Map();

  for (const item of manga) {
    if (!item.title) continue;
    const key = normalizeTitle(item.title);
    const sourceUrl =
      item.sourceName === "MangaDex"
        ? mangaDexUrlFromPath(item.url)
        : item.url?.startsWith("http")
          ? item.url
          : null;

    let publicationStatus = mapTachiyomiStatus(item.status);
    if (item.categoryNames?.includes("Completed") && publicationStatus === "UNKNOWN") {
      publicationStatus = "COMPLETED";
    }
    if (item.categoryNames?.includes("Ongoing") && publicationStatus === "UNKNOWN") {
      publicationStatus = "ONGOING";
    }

    map.set(key, {
      totalPages: Math.max(item.chapterCount ?? 1, 1),
      publicationStatus,
      sourceUrl,
      externalId: null,
    });
  }

  console.log(`  Mihon library: ${map.size} titles`);
  return map;
}

async function backfillFromMap(books, titleMap, label, dryRun) {
  let updated = 0;
  let matched = 0;

  for (const book of books) {
    const payload = titleMap.get(normalizeTitle(book.title));
    if (!payload) continue;
    matched += 1;

    const data = {
      totalPages: payload.totalPages,
      publicationStatus: payload.publicationStatus,
      sourceUrl: payload.sourceUrl ?? book.sourceUrl,
      externalId: payload.externalId ?? book.externalId,
      lastSyncedAt: new Date(),
    };

    if (dryRun) {
      if (matched <= 10) {
        console.log(
          `  [dry-run] ${book.title} → ${data.publicationStatus}, ${data.totalPages} ch`,
        );
      }
    } else {
      await prisma.book.update({ where: { id: book.id }, data });
    }
    updated += 1;
  }

  console.log(`${label}: matched ${matched}, updated ${updated}`);
  return updated;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const manga = await prisma.book.findMany({
    where: { category: "MANGA" },
    select: {
      id: true,
      title: true,
      sourceName: true,
      sourceUrl: true,
      externalId: true,
      publicationStatus: true,
    },
  });

  console.log(`Found ${manga.length} manga in catalog`);
  if (args.dryRun) console.log("DRY RUN — no writes\n");

  let totalUpdated = 0;

  if (args.source === "all" || args.source === "anilist") {
    console.log("\nBuilding AniList title map…");
    const anilistMap = await buildAnilistTitleMap();
    const anilistBooks = manga.filter((b) => b.sourceName === "AniList");
    totalUpdated += await backfillFromMap(
      anilistBooks,
      anilistMap,
      "AniList",
      args.dryRun,
    );
  }

  if (args.source === "all" || args.source === "mihon") {
    console.log("\nLoading Mihon library…");
    const mihonMap = loadMihonTitleMap();
    const mihonBooks = manga.filter((b) => b.sourceName !== "AniList");
    totalUpdated += await backfillFromMap(
      mihonBooks,
      mihonMap,
      "Mihon",
      args.dryRun,
    );
  }

  console.log(`\nDone. ${args.dryRun ? "Would update" : "Updated"} ${totalUpdated} titles.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
