import { MD_UUID_RE, mangadexFetch } from "@/lib/mangadex-api";
import { mangaDexIdFromUrl } from "@/lib/publication";
import { openLibraryWorkKey } from "@/lib/reader/openlibrary-source";
import {
  COMMUNITY_LOOKUP_MS,
  MIN_COMMUNITY_RATING_COUNT,
} from "@/lib/suggestions/options";
import type { CommunityRating, SuggestionEntry } from "@/lib/suggestions/types";

const MANGADEX_CHUNK = 100;
const OPEN_LIBRARY_CONCURRENCY = 4;

export type CommunityBookRef = Pick<
  SuggestionEntry["book"],
  "sourceName" | "sourceUrl" | "externalId"
>;

export type CommunityLookup =
  | { kind: "mangadex"; id: string }
  | { kind: "openlibrary"; id: string };

function clampStars(value: number): number {
  return Math.min(5, Math.max(1, value));
}

export function communityLookupKey(book: CommunityBookRef): CommunityLookup | null {
  const fromUrl = mangaDexIdFromUrl(book.sourceUrl);
  const namedMangaDex = /mangadex/i.test(book.sourceName ?? "");
  const externalUuid =
    book.externalId && MD_UUID_RE.test(book.externalId) ? book.externalId : null;

  if (fromUrl) return { kind: "mangadex", id: fromUrl };
  if (namedMangaDex && externalUuid) return { kind: "mangadex", id: externalUuid };

  const workKey = openLibraryWorkKey(book.externalId);
  if (workKey) return { kind: "openlibrary", id: workKey };
  return null;
}

export function mangaDexCommunityRating(bayesian: number): CommunityRating | null {
  if (!Number.isFinite(bayesian) || bayesian <= 0) return null;
  return {
    stars: clampStars((bayesian / 10) * 5),
    label: `MangaDex ${bayesian.toFixed(1)}`,
  };
}

export function openLibraryCommunityRating(
  average: number,
  count: number,
): CommunityRating | null {
  if (!Number.isFinite(average) || average <= 0) return null;
  if (!Number.isFinite(count) || count < MIN_COMMUNITY_RATING_COUNT) return null;
  return {
    stars: clampStars(average),
    label: `Open Library ${average.toFixed(1)}`,
  };
}

export function parseMangaDexStatistics(body: unknown): Map<string, CommunityRating> {
  const ratings = new Map<string, CommunityRating>();
  if (!body || typeof body !== "object" || !("statistics" in body)) return ratings;
  const statistics = body.statistics;
  if (!statistics || typeof statistics !== "object") return ratings;

  for (const [id, value] of Object.entries(statistics)) {
    if (!value || typeof value !== "object" || !("rating" in value)) continue;
    const rating = value.rating;
    if (!rating || typeof rating !== "object" || !("bayesian" in rating)) continue;
    const parsed = mangaDexCommunityRating(Number(rating.bayesian));
    if (parsed) ratings.set(id.toLowerCase(), parsed);
  }
  return ratings;
}

export function parseOpenLibraryRatings(body: unknown): CommunityRating | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const summary =
    record.summary && typeof record.summary === "object"
      ? (record.summary as Record<string, unknown>)
      : record;
  return openLibraryCommunityRating(Number(summary.average), Number(summary.count));
}

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

async function untilDeadline<T>(work: Promise<T>, deadline: number): Promise<T> {
  const remaining = Math.max(1, deadline - Date.now());
  let timer: ReturnType<typeof setTimeout> | undefined;
  void work.catch(() => undefined);
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("community rating timed out")), remaining);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fillMangaDex(
  books: { bookId: string; id: string }[],
  into: Map<string, CommunityRating>,
  deadline: number,
) {
  const groups = chunk(books, MANGADEX_CHUNK).filter((group) => group.length > 0);
  await mapPool(groups, 3, async (group) => {
    if (Date.now() >= deadline) return;
    try {
      const params = group.map((book) => `manga[]=${encodeURIComponent(book.id)}`).join("&");
      const response = await untilDeadline(
        mangadexFetch(`/statistics/manga?${params}`, { revalidate: 86_400 }),
        deadline,
      );
      const parsed = parseMangaDexStatistics(await response.json());
      for (const book of group) {
        const rating = parsed.get(book.id.toLowerCase());
        if (rating) into.set(book.bookId, rating);
      }
    } catch {
      // This chunk keeps the taste-only score.
    }
  });
}

async function fillOpenLibrary(
  bookId: string,
  workKey: string,
  into: Map<string, CommunityRating>,
  deadline: number,
) {
  if (Date.now() >= deadline) return;
  try {
    const response = await fetch(`https://openlibrary.org/works/${workKey}/ratings.json`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
      next: { revalidate: 86_400 },
    });
    if (!response.ok) return;
    const rating = parseOpenLibraryRatings(await response.json());
    if (rating) into.set(bookId, rating);
  } catch {
    // This title keeps the taste-only score.
  }
}

async function mapPool<T>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<void>,
) {
  if (items.length === 0) return;
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      if (!current) return;
      await run(current);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
}

/** Community scores for titles that already passed the continue-reading filters. */
export async function lookupCommunityRatings(
  entries: SuggestionEntry[],
): Promise<Map<string, CommunityRating>> {
  const ratings = new Map<string, CommunityRating>();
  const deadline = Date.now() + COMMUNITY_LOOKUP_MS;
  const mangadex: { bookId: string; id: string }[] = [];
  const openLibrary: { bookId: string; id: string }[] = [];

  for (const entry of entries) {
    if (entry.rating != null && entry.rating >= 1) continue;
    const key = communityLookupKey(entry.book);
    if (!key) continue;
    if (key.kind === "mangadex") mangadex.push({ bookId: entry.bookId, id: key.id });
    else openLibrary.push({ bookId: entry.bookId, id: key.id });
  }

  await Promise.all([
    fillMangaDex(mangadex, ratings, deadline),
    mapPool(openLibrary, OPEN_LIBRARY_CONCURRENCY, (book) =>
      fillOpenLibrary(book.bookId, book.id, ratings, deadline),
    ),
  ]);

  return ratings;
}
