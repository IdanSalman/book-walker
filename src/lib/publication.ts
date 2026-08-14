import type { Book, PublicationStatus } from "@prisma/client";

export const PUBLICATION_STATUS_LABELS: Record<PublicationStatus, string> = {
  ONGOING: "Ongoing",
  COMPLETED: "Completed",
  HIATUS: "On hiatus",
  CANCELLED: "Cancelled",
  UNKNOWN: "Unknown",
};

export const PUBLICATION_FILTER_OPTIONS: {
  value: PublicationStatus;
  label: string;
}[] = [
  { value: "ONGOING", label: PUBLICATION_STATUS_LABELS.ONGOING },
  { value: "COMPLETED", label: PUBLICATION_STATUS_LABELS.COMPLETED },
  { value: "HIATUS", label: PUBLICATION_STATUS_LABELS.HIATUS },
  { value: "CANCELLED", label: PUBLICATION_STATUS_LABELS.CANCELLED },
  { value: "UNKNOWN", label: PUBLICATION_STATUS_LABELS.UNKNOWN },
];

export function parsePublicationFilter(
  value: string | undefined,
): PublicationStatus | undefined {
  if (!value) return undefined;
  return PUBLICATION_FILTER_OPTIONS.some((option) => option.value === value)
    ? (value as PublicationStatus)
    : undefined;
}

export function isOngoingPublication(
  status: PublicationStatus | null | undefined,
): boolean {
  return status === "ONGOING" || status === "HIATUS";
}

export function pageCountLabel(
  totalPages: number,
  publicationStatus?: PublicationStatus | null,
): string {
  const count = totalPages.toLocaleString();
  if (isOngoingPublication(publicationStatus)) {
    return `${count}/?`;
  }
  return count;
}

export function progressLabel(
  currentPage: number,
  book: Pick<Book, "totalPages" | "publicationStatus">,
): string {
  const total = pageCountLabel(book.totalPages, book.publicationStatus);
  return `${currentPage.toLocaleString()} / ${total}`;
}

export function pagesMetadataLabel(
  book: Pick<Book, "category" | "totalPages" | "publicationStatus">,
): string {
  if (book.category === "MANGA" || book.category === "LIGHT_NOVEL") {
    return pageCountLabel(book.totalPages, book.publicationStatus);
  }
  return book.totalPages.toLocaleString();
}

export function pagesFieldLabel(
  category: Book["category"],
): string {
  if (category === "MANGA") return "Chapters";
  if (category === "LIGHT_NOVEL") return "Volumes / chapters";
  return "Pages";
}

export function canSyncMetadata(book: Pick<Book, "externalId" | "sourceUrl">): boolean {
  return Boolean(book.externalId?.startsWith("anilist:") || isMangaDexUrl(book.sourceUrl));
}

export function isMangaDexUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /mangadex\.org/i.test(url) || /^\/manga\/[0-9a-f-]{36}$/i.test(url);
}

export function normalizeMangaDexUrl(url: string): string | null {
  const trimmed = url.trim();
  const relative = trimmed.match(/^\/manga\/([0-9a-f-]{36})$/i);
  if (relative) {
    return `https://mangadex.org/title/${relative[1]}`;
  }
  const absolute = trimmed.match(
    /mangadex\.org\/(?:title|manga)\/([0-9a-f-]{36})/i,
  );
  if (absolute) {
    return `https://mangadex.org/title/${absolute[1]}`;
  }
  return null;
}

export function mangaDexIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const normalized = normalizeMangaDexUrl(url);
  if (!normalized) return null;
  const match = normalized.match(/([0-9a-f-]{36})$/i);
  return match?.[1] ?? null;
}
