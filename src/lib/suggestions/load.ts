import type { Prisma } from "@prisma/client";

import { hideAdultUserBookFilter } from "@/lib/adult-content";
import { prisma } from "@/lib/prisma";
import { progressLabel } from "@/lib/publication";
import { lookupCommunityRatings } from "@/lib/suggestions/community-rating";
import { isSuggestionCandidate, rankContinueSuggestions } from "@/lib/suggestions/score";
import type {
  CommunityRating,
  ContinueSuggestion,
  ScoredSuggestion,
  SuggestionEntry,
} from "@/lib/suggestions/types";

const SUGGESTION_SELECT = {
  id: true,
  bookId: true,
  currentPage: true,
  rating: true,
  status: true,
  lastReadAt: true,
  book: {
    select: {
      title: true,
      coverUrl: true,
      totalPages: true,
      category: true,
      publicationStatus: true,
      genres: true,
      author: true,
      artist: true,
      isAdult: true,
      externalId: true,
      sourceUrl: true,
      sourceName: true,
    },
  },
} as const;

type SuggestionRow = Prisma.UserBookGetPayload<{ select: typeof SUGGESTION_SELECT }>;

function toEntry(row: SuggestionRow): SuggestionEntry {
  return {
    id: row.id,
    bookId: row.bookId,
    currentPage: row.currentPage,
    rating: row.rating,
    status: row.status,
    lastReadAt: row.lastReadAt,
    book: row.book,
  };
}

function toContinue(scored: ScoredSuggestion): ContinueSuggestion {
  const { entry } = scored;
  const progressPercent =
    entry.book.totalPages > 0
      ? Math.min(100, (entry.currentPage / entry.book.totalPages) * 100)
      : null;
  return {
    bookId: entry.bookId,
    title: entry.book.title,
    coverUrl: entry.book.coverUrl,
    progressText: progressLabel(entry.currentPage, entry.book),
    progressPercent,
    score: scored.score,
    reason: scored.reason,
  };
}

export async function loadContinueSuggestions(
  userId: string,
  hideAdult: boolean,
): Promise<ContinueSuggestion[]> {
  const rows = await prisma.userBook.findMany({
    where: {
      userId,
      ...hideAdultUserBookFilter(hideAdult),
    },
    select: SUGGESTION_SELECT,
  });

  const entries = rows.map(toEntry);
  const now = new Date();
  const eligible = entries.filter((entry) => isSuggestionCandidate(entry, now));

  let community = new Map<string, CommunityRating>();
  if (eligible.length > 0) {
    try {
      community = await lookupCommunityRatings(eligible);
    } catch {
      community = new Map();
    }
  }

  return rankContinueSuggestions(entries, { now, hideAdult, community }).map(toContinue);
}
