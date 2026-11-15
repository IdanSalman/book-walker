import {
  ANCIENT_AFTER_DAYS,
  MIN_BOOK_PAGES_READ,
  MIN_CHAPTERS_READ,
  SCORE_WEIGHTS,
  STALE_AFTER_DAYS,
  STALENESS_PENALTY,
  SUGGESTION_POOL_SIZE,
} from "@/lib/suggestions/options";
import type {
  CommunityRating,
  ScoredSuggestion,
  SuggestionEntry,
} from "@/lib/suggestions/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const CHAPTER_INVESTMENT_CAP = 80;
const PAGE_INVESTMENT_CAP = 400;
const FINISH_START = 0.5;

type Affinity = { sum: number; mass: number };

export type TasteProfile = {
  genres: Map<string, Affinity>;
  creators: Map<string, Affinity>;
};

export function daysSinceRead(lastReadAt: Date, now: Date): number {
  return Math.floor((now.getTime() - lastReadAt.getTime()) / DAY_MS);
}

export function minimumProgress(entry: SuggestionEntry): number {
  return entry.book.category === "BOOK" ? MIN_BOOK_PAGES_READ : MIN_CHAPTERS_READ;
}

export function isUnfinished(entry: SuggestionEntry): boolean {
  return entry.book.totalPages <= 0 || entry.currentPage < entry.book.totalPages;
}

export function isStale(entry: SuggestionEntry, now: Date): boolean {
  return now.getTime() - entry.lastReadAt.getTime() >= STALE_AFTER_DAYS * DAY_MS;
}

export function isSuggestionCandidate(entry: SuggestionEntry, now: Date): boolean {
  if (entry.status !== "READING") return false;
  if (entry.currentPage < minimumProgress(entry)) return false;
  if (!isUnfinished(entry)) return false;
  return isStale(entry, now);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 1 star → -1, 3 → 0, 5 → 1. Missing ratings are not a signal. */
function ratingAffinity(rating: number): number {
  return (clamp(rating, 1, 5) - 3) / 2;
}

function personalStars(rating: number | null): number | null {
  if (rating == null || !Number.isFinite(rating) || rating < 1) return null;
  return clamp(rating, 1, 5);
}

function starsUnit(stars: number): number {
  return (clamp(stars, 1, 5) - 1) / 4;
}

export function genreKey(value: string): string {
  return value.trim().toLowerCase();
}

export function creatorKey(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function addAffinity(map: Map<string, Affinity>, key: string, affinity: number, mass: number) {
  const row = map.get(key) ?? { sum: 0, mass: 0 };
  row.sum += affinity * mass;
  row.mass += mass;
  map.set(key, row);
}

function addCreator(map: Map<string, Affinity>, name: string | null, affinity: number, mass: number) {
  const key = creatorKey(name);
  if (!key) return;
  addAffinity(map, key, affinity, mass);
}

/**
 * Taste comes from the whole library. Stars count only when the user set
 * them. Completed titles and titles read past the minimum still add a
 * smaller positive weight, so an unrated library is not treated as empty.
 */
export function buildTasteProfile(entries: SuggestionEntry[]): TasteProfile {
  const genres = new Map<string, Affinity>();
  const creators = new Map<string, Affinity>();

  for (const entry of entries) {
    const signals: { affinity: number; mass: number }[] = [];
    const stars = personalStars(entry.rating);
    if (stars != null) signals.push({ affinity: ratingAffinity(stars), mass: 2 });
    if (entry.status === "COMPLETED") signals.push({ affinity: 0.35, mass: 1 });
    if (entry.currentPage >= minimumProgress(entry)) {
      signals.push({ affinity: 0.2, mass: 1 });
    }
    if (signals.length === 0) continue;

    const keys = [...new Set(entry.book.genres.map(genreKey).filter(Boolean))];
    for (const signal of signals) {
      for (const key of keys) {
        addAffinity(genres, key, signal.affinity, signal.mass);
      }
      addCreator(creators, entry.book.author, signal.affinity, signal.mass);
      addCreator(creators, entry.book.artist, signal.affinity, signal.mass);
    }
  }

  return { genres, creators };
}

function hasSignal(map: Map<string, Affinity>): boolean {
  for (const row of map.values()) {
    if (row.mass > 0) return true;
  }
  return false;
}

/**
 * Average affinity of the keys this title actually shares with the profile.
 * Null when the profile has no signal at all, so the term is left out.
 * Zero when the profile has taste and this title shares none of it.
 */
function overlapUnit(keys: string[], map: Map<string, Affinity>): number | null {
  if (!hasSignal(map)) return null;
  const matched: number[] = [];
  for (const key of keys) {
    const row = map.get(key);
    if (!row || row.mass <= 0) continue;
    matched.push(row.sum / row.mass);
  }
  if (matched.length === 0) return 0;
  const average = matched.reduce((sum, value) => sum + value, 0) / matched.length;
  return clamp(average, -1, 1);
}

function investmentUnit(entry: SuggestionEntry): number {
  const cap = entry.book.category === "BOOK" ? PAGE_INVESTMENT_CAP : CHAPTER_INVESTMENT_CAP;
  const read = Math.max(1, entry.currentPage);
  return clamp(Math.log(read) / Math.log(cap), 0, 1);
}

/** Bonus only once a finished publication is at least halfway done. */
function finishUnit(entry: SuggestionEntry): number | null {
  if (entry.book.publicationStatus !== "COMPLETED" || entry.book.totalPages <= 0) {
    return null;
  }
  const ratio = entry.currentPage / entry.book.totalPages;
  if (ratio < FINISH_START) return null;
  return clamp((ratio - FINISH_START) / (1 - FINISH_START), 0, 1);
}

function stalenessPenalty(days: number): number {
  if (days <= STALE_AFTER_DAYS) return 0;
  const span = ANCIENT_AFTER_DAYS - STALE_AFTER_DAYS;
  const progress = clamp((days - STALE_AFTER_DAYS) / span, 0, 1);
  return progress * STALENESS_PENALTY;
}

function matchedGenreLabels(entry: SuggestionEntry, profile: TasteProfile): string[] {
  const ranked = entry.book.genres
    .map((label) => {
      const row = profile.genres.get(genreKey(label));
      const affinity = row && row.mass > 0 ? row.sum / row.mass : 0;
      return { label, affinity };
    })
    .filter((genre) => genre.affinity > 0.05)
    .sort((left, right) => right.affinity - left.affinity || left.label.localeCompare(right.label));
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const genre of ranked) {
    const key = genreKey(genre.label);
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(genre.label.trim());
    if (labels.length === 2) break;
  }
  return labels;
}

function progressNoun(entry: SuggestionEntry): string {
  const count = entry.currentPage;
  if (entry.book.category === "BOOK") return count === 1 ? "page" : "pages";
  return count === 1 ? "chapter" : "chapters";
}

function formatStars(stars: number): string {
  return Number.isInteger(stars) ? String(stars) : stars.toFixed(1);
}

export function suggestionReason(
  entry: SuggestionEntry,
  profile: TasteProfile,
  days: number,
  community: CommunityRating | null,
): string {
  const parts: string[] = [];
  const stars = personalStars(entry.rating);
  if (community && stars == null) parts.push(community.label);
  if (stars != null) parts.push(`You rated ${formatStars(stars)}`);
  const genres = matchedGenreLabels(entry, profile);
  if (genres.length > 0) parts.push(genres.join(", "));
  parts.push(`${entry.currentPage.toLocaleString()} ${progressNoun(entry)} in`);
  parts.push(days === 1 ? "last read 1 day ago" : `last read ${days.toLocaleString()} days ago`);
  return parts.join(" · ");
}

type Term = { weight: number; unit: number };

function scaledScore(terms: Term[]): number {
  const weight = terms.reduce((sum, term) => sum + term.weight, 0);
  if (weight <= 0) return 0;
  const raw = terms.reduce((sum, term) => sum + term.weight * term.unit, 0);
  return (raw / weight) * 100;
}

export function scoreSuggestion(
  entry: SuggestionEntry,
  profile: TasteProfile,
  now: Date,
  community?: CommunityRating | null,
): ScoredSuggestion {
  const days = Math.max(0, daysSinceRead(entry.lastReadAt, now));
  const terms: Term[] = [];
  const stars = personalStars(entry.rating);
  const standIn = stars == null ? community ?? null : null;

  if (stars != null) {
    terms.push({ weight: SCORE_WEIGHTS.personalRating, unit: starsUnit(stars) });
  } else if (standIn && Number.isFinite(standIn.stars)) {
    terms.push({
      weight: SCORE_WEIGHTS.communityRating,
      unit: starsUnit(standIn.stars),
    });
  }

  const genres = overlapUnit(
    entry.book.genres.map(genreKey).filter(Boolean),
    profile.genres,
  );
  if (genres != null) terms.push({ weight: SCORE_WEIGHTS.genre, unit: genres });

  const creatorKeys = [creatorKey(entry.book.author), creatorKey(entry.book.artist)].filter(
    (key): key is string => key != null,
  );
  const creators = overlapUnit([...new Set(creatorKeys)], profile.creators);
  if (creators != null) terms.push({ weight: SCORE_WEIGHTS.creator, unit: creators });

  terms.push({ weight: SCORE_WEIGHTS.investment, unit: investmentUnit(entry) });

  const finish = finishUnit(entry);
  const finishBonus = finish == null ? 0 : finish * SCORE_WEIGHTS.finish;
  const score = clamp(
    Math.round(scaledScore(terms) + finishBonus - stalenessPenalty(days)),
    0,
    100,
  );

  return {
    entry,
    score,
    daysSinceRead: days,
    reason: suggestionReason(entry, profile, days, standIn),
  };
}

export function rankContinueSuggestions(
  entries: SuggestionEntry[],
  options: {
    now: Date;
    hideAdult: boolean;
    community?: ReadonlyMap<string, CommunityRating>;
    limit?: number;
  },
): ScoredSuggestion[] {
  const visible = options.hideAdult
    ? entries.filter((entry) => !entry.book.isAdult)
    : entries;
  const profile = buildTasteProfile(visible);
  const limit = options.limit ?? SUGGESTION_POOL_SIZE;

  return visible
    .filter((entry) => isSuggestionCandidate(entry, options.now))
    .map((entry) =>
      scoreSuggestion(
        entry,
        profile,
        options.now,
        options.community?.get(entry.bookId) ?? null,
      ),
    )
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.daysSinceRead - right.daysSinceRead ||
        left.entry.book.title.localeCompare(right.entry.book.title),
    )
    .slice(0, limit);
}
