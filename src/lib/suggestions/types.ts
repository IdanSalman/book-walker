export type SuggestionCategory = "MANGA" | "LIGHT_NOVEL" | "BOOK";

export type SuggestionPublication =
  | "ONGOING"
  | "COMPLETED"
  | "HIATUS"
  | "CANCELLED"
  | "UNKNOWN";

export type SuggestionStatus = "READING" | "COMPLETED" | "PLAN_TO_READ";

export type SuggestionEntry = {
  id: string;
  bookId: string;
  currentPage: number;
  rating: number | null;
  status: SuggestionStatus;
  lastReadAt: Date;
  book: {
    title: string;
    coverUrl: string;
    totalPages: number;
    category: SuggestionCategory;
    publicationStatus: SuggestionPublication;
    genres: string[];
    author: string | null;
    artist: string | null;
    isAdult: boolean;
    externalId: string | null;
    sourceUrl: string | null;
    sourceName: string | null;
  };
};

/** A source score already mapped onto the 1–5 star slot. */
export type CommunityRating = {
  stars: number;
  label: string;
};

export type ScoredSuggestion = {
  entry: SuggestionEntry;
  score: number;
  reason: string;
  daysSinceRead: number;
};

export type ContinueSuggestion = {
  bookId: string;
  title: string;
  coverUrl: string;
  progressText: string;
  progressPercent: number | null;
  score: number;
  reason: string;
};
