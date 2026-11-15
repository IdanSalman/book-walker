import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { STALENESS_PENALTY } from "./options";
import { buildTasteProfile, isSuggestionCandidate, rankContinueSuggestions, scoreSuggestion } from "./score";
import type { CommunityRating, SuggestionEntry } from "./types";

const NOW = new Date("2026-11-15T12:00:00.000Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

function entry(overrides: {
  id?: string;
  bookId?: string;
  currentPage?: number;
  rating?: number | null;
  status?: SuggestionEntry["status"];
  lastReadAt?: Date;
  title?: string;
  totalPages?: number;
  category?: SuggestionEntry["book"]["category"];
  publicationStatus?: SuggestionEntry["book"]["publicationStatus"];
  genres?: string[];
  author?: string | null;
  artist?: string | null;
  isAdult?: boolean;
}): SuggestionEntry {
  const id = overrides.id ?? overrides.bookId ?? "entry";
  return {
    id,
    bookId: overrides.bookId ?? id,
    currentPage: overrides.currentPage ?? 10,
    rating: overrides.rating ?? null,
    status: overrides.status ?? "READING",
    lastReadAt: overrides.lastReadAt ?? daysAgo(20),
    book: {
      title: overrides.title ?? id,
      coverUrl: "",
      totalPages: overrides.totalPages ?? 100,
      category: overrides.category ?? "MANGA",
      publicationStatus: overrides.publicationStatus ?? "ONGOING",
      genres: overrides.genres ?? [],
      author: overrides.author ?? null,
      artist: overrides.artist ?? null,
      isAdult: overrides.isAdult ?? false,
      externalId: null,
      sourceUrl: null,
      sourceName: null,
    },
  };
}

function ranked(
  entries: SuggestionEntry[],
  community?: Map<string, CommunityRating>,
) {
  return rankContinueSuggestions(entries, { now: NOW, hideAdult: true, community });
}

function scoreOf(entries: SuggestionEntry[], bookId: string, community?: Map<string, CommunityRating>) {
  const match = ranked(entries, community).find((item) => item.entry.bookId === bookId);
  assert.ok(match, `${bookId} should be suggested`);
  return match;
}

describe("isSuggestionCandidate", () => {
  it("keeps a stalled in-progress title that is not finished", () => {
    assert.equal(isSuggestionCandidate(entry({}), NOW), true);
    assert.equal(
      isSuggestionCandidate(
        entry({ publicationStatus: "HIATUS", lastReadAt: daysAgo(14) }),
        NOW,
      ),
      true,
    );
    assert.equal(
      isSuggestionCandidate(entry({ publicationStatus: "CANCELLED", totalPages: 0 }), NOW),
      true,
    );
  });

  it("requires reading status, minimum progress, unfinished, and 14 stale days", () => {
    assert.equal(isSuggestionCandidate(entry({ status: "COMPLETED" }), NOW), false);
    assert.equal(isSuggestionCandidate(entry({ status: "PLAN_TO_READ" }), NOW), false);
    assert.equal(isSuggestionCandidate(entry({ currentPage: 2 }), NOW), false);
    assert.equal(
      isSuggestionCandidate(entry({ category: "BOOK", currentPage: 19 }), NOW),
      false,
    );
    assert.equal(
      isSuggestionCandidate(entry({ category: "LIGHT_NOVEL", currentPage: 3 }), NOW),
      true,
    );
    assert.equal(
      isSuggestionCandidate(entry({ category: "BOOK", currentPage: 20 }), NOW),
      true,
    );
    assert.equal(isSuggestionCandidate(entry({ currentPage: 100, totalPages: 100 }), NOW), false);
    assert.equal(isSuggestionCandidate(entry({ lastReadAt: daysAgo(13) }), NOW), false);
  });
});

describe("rankContinueSuggestions", () => {
  it("does not treat a missing personal rating as a low score", () => {
    const profile = buildTasteProfile([
      entry({
        id: "loved",
        status: "COMPLETED",
        rating: 5,
        genres: ["Action"],
        currentPage: 40,
        lastReadAt: daysAgo(1),
      }),
    ]);
    const unrated = scoreSuggestion(
      entry({ id: "unrated", genres: ["Action"], currentPage: 40 }),
      profile,
      NOW,
    );
    const disliked = scoreSuggestion(
      entry({ id: "disliked", genres: ["Action"], currentPage: 40, rating: 1 }),
      profile,
      NOW,
    );

    assert.ok(unrated.score >= 50, `unrated score ${unrated.score} should stay solid`);
    assert.ok(unrated.score > disliked.score);
    assert.doesNotMatch(unrated.reason, /rated/i);
  });

  it("ranks a personal five above a community five above an unrated title", () => {
    const taste = entry({
      id: "taste",
      status: "READING",
      genres: ["Action"],
      currentPage: 4,
      lastReadAt: daysAgo(1),
    });
    const personal = entry({ id: "personal", genres: ["Action"], currentPage: 8, rating: 5 });
    const communityBook = entry({ id: "community", genres: ["Action"], currentPage: 8 });
    const plain = entry({ id: "plain", genres: ["Action"], currentPage: 8 });
    const community = new Map<string, CommunityRating>([
      ["community", { stars: 5, label: "MangaDex 10.0" }],
    ]);
    const entries = [taste, personal, communityBook, plain];

    const personalScore = scoreOf(entries, "personal", community).score;
    const communityScore = scoreOf(entries, "community", community).score;
    const plainScore = scoreOf(entries, "plain", community).score;

    assert.ok(personalScore > communityScore);
    assert.ok(communityScore > plainScore);
    assert.match(scoreOf(entries, "community", community).reason, /MangaDex 10\.0/);
    assert.doesNotMatch(scoreOf(entries, "plain", community).reason, /rated/i);
    assert.match(scoreOf(entries, "personal", community).reason, /You rated 5/);
  });

  it("ignores a community rating when the user already rated the title", () => {
    const personal = entry({ id: "personal", currentPage: 30, rating: 1, genres: ["Drama"] });
    const community = new Map<string, CommunityRating>([
      ["personal", { stars: 5, label: "MangaDex 9.0" }],
    ]);
    const scored = scoreOf([personal], "personal", community);
    assert.doesNotMatch(scored.reason, /MangaDex/);
    assert.match(scored.reason, /You rated 1/);
  });

  it("prefers a shared genre and author over an unrelated title", () => {
    const finished = entry({
      id: "finished",
      status: "COMPLETED",
      rating: 5,
      genres: ["Fantasy"],
      author: "Ada",
      currentPage: 20,
      lastReadAt: daysAgo(2),
    });
    const match = entry({
      id: "match",
      genres: ["Fantasy"],
      author: "Ada",
      currentPage: 12,
    });
    const other = entry({
      id: "other",
      genres: ["Cooking"],
      author: "Bea",
      currentPage: 12,
    });
    const matchScore = scoreOf([finished, match, other], "match").score;
    const otherScore = scoreOf([finished, match, other], "other").score;
    assert.ok(matchScore > otherScore);
    assert.match(scoreOf([finished, match, other], "match").reason, /Fantasy/);
  });

  it("ranks a nearly finished completed publication above an early one", () => {
    const close = entry({
      id: "close",
      publicationStatus: "COMPLETED",
      currentPage: 45,
      totalPages: 50,
    });
    const early = entry({
      id: "early",
      publicationStatus: "COMPLETED",
      currentPage: 45,
      totalPages: 200,
    });
    assert.ok(scoreOf([close, early], "close").score > scoreOf([close, early], "early").score);
  });

  it("penalizes a years-old stall by only a few points", () => {
    const recent = entry({ id: "recent", currentPage: 25, lastReadAt: daysAgo(14) });
    const ancient = entry({ id: "ancient", currentPage: 25, lastReadAt: daysAgo(800) });
    const recentScore = scoreOf([recent, ancient], "recent").score;
    const ancientScore = scoreOf([recent, ancient], "ancient").score;
    assert.ok(recentScore > ancientScore);
    assert.ok(recentScore - ancientScore <= STALENESS_PENALTY);
  });

  it("hides adult titles and keeps the highest scores within the pool", () => {
    const adult = entry({ id: "adult", isAdult: true, currentPage: 80 });
    const rows = [adult];
    for (let index = 0; index < 31; index += 1) {
      rows.push(entry({ id: `title-${index}`, currentPage: 3 + index, title: `Title ${index}` }));
    }
    const result = ranked(rows);
    assert.equal(result.some((item) => item.entry.bookId === "adult"), false);
    assert.equal(result.length, 30);
    assert.equal(result[0]?.entry.bookId, "title-30");
  });

  it("mentions chapters read and days since the last session", () => {
    const scored = scoreOf([entry({ id: "stalled", currentPage: 18, lastReadAt: daysAgo(23) })], "stalled");
    assert.match(scored.reason, /18 chapters in/);
    assert.match(scored.reason, /last read 23 days ago/);
    assert.doesNotMatch(scored.reason, /rated/i);
  });
});
