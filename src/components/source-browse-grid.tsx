"use client";

import { useState } from "react";

import { AddToLibraryButton } from "@/components/add-to-library-button";
import { AddToStoreButton } from "@/components/add-to-store-button";
import { BookDetailModal } from "@/components/book-detail-modal";
import { CoverImage } from "@/components/cover-image";
import { Badge } from "@/components/ui/badge";
import { PUBLICATION_STATUS_LABELS } from "@/lib/publication";
import type { SourceBrowseItem } from "@/lib/sources/browse";

export function SourceBrowseGrid({
  sourceKey,
  items,
  isAdmin,
  coverReferer,
}: {
  sourceKey: string;
  items: SourceBrowseItem[];
  isAdmin: boolean;
  coverReferer?: string;
}) {
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {items.map((item, index) => {
          const previewId = item.bookId ?? item.existingTitle?.id ?? null;
          return (
            <SourceBrowseCard
              key={`${item.id}-${index}`}
              sourceKey={sourceKey}
              item={item}
              isAdmin={isAdmin}
              priority={index < 8}
              coverReferer={coverReferer}
              onSelect={previewId ? () => setSelectedBookId(previewId) : undefined}
            />
          );
        })}
      </div>

      {selectedBookId && (
        <BookDetailModal
          bookId={selectedBookId}
          onClose={() => setSelectedBookId(null)}
        />
      )}
    </>
  );
}

function SourceBrowseCard({
  sourceKey,
  item,
  isAdmin,
  priority,
  coverReferer,
  onSelect,
}: {
  sourceKey: string;
  item: SourceBrowseItem;
  isAdmin: boolean;
  priority: boolean;
  coverReferer?: string;
  onSelect?: () => void;
}) {
  const meta = [
    item.year ? String(item.year) : null,
    item.publicationStatus !== "UNKNOWN"
      ? PUBLICATION_STATUS_LABELS[item.publicationStatus]
      : null,
    item.lastChapter ? `Ch. ${item.lastChapter}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const body = (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 transition hover:border-zinc-600 hover:bg-zinc-900">
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-zinc-800">
        <CoverImage
          src={item.coverUrl}
          alt={item.title}
          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 200px"
          priority={priority}
          referer={coverReferer}
          className="transition group-hover:scale-105"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold text-zinc-50">
          {item.title}
        </h3>
        {meta && <p className="text-xs text-zinc-500">{meta}</p>}
        <div className="flex flex-wrap gap-1">
          {item.inCatalog && (
            <Badge className="border-sky-900/50 bg-sky-950/50 text-sky-300">
              In store
            </Badge>
          )}
          {!item.inCatalog && item.existingTitle && (
            <Badge className="border-amber-900/50 bg-amber-950/50 text-amber-200">
              In store
              {item.existingTitle.sourceName
                ? ` · ${item.existingTitle.sourceName}`
                : ""}
            </Badge>
          )}
          {item.isAdult && (
            <Badge className="border-red-900/50 bg-red-950/50 text-red-300">
              Adult
            </Badge>
          )}
          {item.genres.slice(0, 2).map((genre) => (
            <Badge key={genre}>{genre}</Badge>
          ))}
        </div>
        {item.summary && (
          <p className="line-clamp-2 text-xs text-zinc-500">{item.summary}</p>
        )}
      </div>
    </article>
  );

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          className="block h-full w-full cursor-pointer text-left"
        >
          {body}
        </button>
      ) : (
        body
      )}
      {item.inCatalog && item.bookId ? (
        <AddToLibraryButton bookId={item.bookId} inLibrary={item.inLibrary} />
      ) : isAdmin ? (
        <AddToStoreButton sourceKey={sourceKey} titleId={item.id} />
      ) : item.existingTitle ? (
        <AddToLibraryButton
          bookId={item.existingTitle.id}
          inLibrary={item.inLibrary}
        />
      ) : (
        <p className="text-xs text-zinc-500">Not in the store yet</p>
      )}
    </div>
  );
}
