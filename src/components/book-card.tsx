import Image from "next/image";
import Link from "next/link";
import type { Book, UserBook } from "@prisma/client";

import { StarsDisplay } from "@/components/stars";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { categoryLabel } from "@/lib/categories";
import { coverDisplayUrl } from "@/lib/cover-url";
import {
  PUBLICATION_STATUS_LABELS,
  isOngoingPublication,
  pageCountLabel,
  progressLabel,
} from "@/lib/publication";

export type BookCardBook = Pick<
  Book,
  "id" | "title" | "coverUrl" | "totalPages" | "category" | "publicationStatus"
> & {
  summary?: string | null;
  isAdult?: boolean;
  coverCorrupted?: boolean;
};

type BookCardProps = {
  book: BookCardBook;
  userBook?: Pick<UserBook, "currentPage" | "rating" | "status"> | null;
  href?: string;
  onSelect?: () => void;
  lazyCover?: boolean;
  priority?: boolean;
};

const statusLabel: Record<string, string> = {
  READING: "Reading",
  COMPLETED: "Completed",
  PLAN_TO_READ: "Plan to read",
};

export function BookCard({
  book,
  userBook,
  href,
  onSelect,
  lazyCover,
  priority,
}: BookCardProps) {
  const progress =
    book.totalPages > 0 && userBook
      ? (userBook.currentPage / book.totalPages) * 100
      : 0;
  const showPublicationBadge =
    !userBook &&
    (book.category === "MANGA" || book.category === "LIGHT_NOVEL") &&
    book.publicationStatus !== "UNKNOWN";
  const eager = Boolean(priority);
  const lazy = !eager && lazyCover !== false;

  const content = (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 [content-visibility:auto] [contain-intrinsic-size:auto_28rem] transition hover:border-zinc-600 hover:bg-zinc-900">
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-zinc-800">
        <Image
          src={coverDisplayUrl(book.coverUrl, eager ? 512 : 256)}
          alt={book.title}
          fill
          className="object-cover transition group-hover:scale-105"
          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 200px"
          unoptimized
          priority={eager}
          loading={lazy ? "lazy" : undefined}
          fetchPriority={eager ? "high" : "low"}
          decoding="async"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-semibold text-zinc-50">
            {book.title}
          </h3>
        </div>
        <Badge className="w-fit">{categoryLabel(book.category)}</Badge>
        {showPublicationBadge && (
          <Badge
            className={
              isOngoingPublication(book.publicationStatus)
                ? "w-fit border-sky-900/50 bg-sky-950/50 text-sky-300"
                : book.publicationStatus === "COMPLETED"
                  ? "w-fit border-emerald-900/50 bg-emerald-950/50 text-emerald-300"
                  : "w-fit"
            }
          >
            {PUBLICATION_STATUS_LABELS[book.publicationStatus]}
          </Badge>
        )}
        {userBook ? (
          <>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>{progressLabel(userBook.currentPage, book)}</span>
                {!isOngoingPublication(book.publicationStatus) && (
                  <span>{Math.round(progress)}%</span>
                )}
              </div>
              <Progress value={progress} />
            </div>
            <div className="mt-auto flex items-center justify-between pt-1">
              <StarsDisplay rating={userBook.rating} />
              <span className="text-xs text-zinc-500">
                {statusLabel[userBook.status]}
              </span>
            </div>
          </>
        ) : (
          <p className="line-clamp-2 text-xs text-zinc-500">
            {(book.category === "MANGA" || book.category === "LIGHT_NOVEL") &&
            isOngoingPublication(book.publicationStatus)
              ? `${pageCountLabel(book.totalPages, book.publicationStatus)} chapters · `
              : ""}
            {book.summary}
          </p>
        )}
      </div>
    </article>
  );

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className="block h-full w-full cursor-pointer text-left"
      >
        {content}
      </button>
    );
  }

  if (href) {
    return (
      <Link href={href} className="block h-full" prefetch={false}>
        {content}
      </Link>
    );
  }

  return content;
}

export function BookCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
      <div className="aspect-[2/3] w-full animate-pulse bg-zinc-800" />
      <div className="space-y-2 p-3">
        <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-800" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-800" />
        <div className="h-2 w-full animate-pulse rounded bg-zinc-800" />
      </div>
    </div>
  );
}
