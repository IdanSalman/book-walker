"use client";

import { useCallback, useState } from "react";

import { AddToLibraryButton } from "@/components/add-to-library-button";
import { AddToStoreButton } from "@/components/add-to-store-button";
import { BookDetailModal } from "@/components/book-detail-modal";
import { CoverImage } from "@/components/cover-image";
import { PagedInfiniteList } from "@/components/paged-infinite-list";
import { Badge } from "@/components/ui/badge";
import { PUBLICATION_STATUS_LABELS } from "@/lib/publication";
import {
  sourceBrowseHref,
  type SourceBrowseItem,
} from "@/lib/sources/browse";
import type { SourceBrowsePageResult } from "@/lib/sources/browse-page";

export function SourceBrowseGrid({
  sourceKey,
  items,
  isAdmin,
  coverReferer,
  page,
  hasMore,
  view,
  q,
  category,
}: {
  sourceKey: string;
  items: SourceBrowseItem[];
  isAdmin: boolean;
  coverReferer?: string;
  page: number;
  hasMore: boolean;
  view?: string;
  q?: string;
  category?: string;
}) {
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [patches, setPatches] = useState<
    Record<string, Partial<SourceBrowseItem>>
  >({});

  function withPatch(item: SourceBrowseItem): SourceBrowseItem {
    const patch = patches[item.id];
    return patch ? { ...item, ...patch } : item;
  }

  const fetchPage = useCallback(
    async (nextPage: number) => {
      const params = new URLSearchParams();
      if (view) params.set("view", view);
      if (q) params.set("q", q);
      if (category) params.set("category", category);
      params.set("page", String(nextPage));

      const response = await fetch(
        `/api/sources/${encodeURIComponent(sourceKey)}/browse?${params}`,
      );
      if (!response.ok) throw new Error("Failed to load source page");
      const data = (await response.json()) as SourceBrowsePageResult;
      return { items: data.items, hasMore: data.hasMore };
    },
    [sourceKey, view, q, category],
  );

  return (
    <>
      <PagedInfiniteList
        resetKey={sourceBrowseHref(sourceKey, page, { view, q, category })}
        initialPage={page}
        initialItems={items}
        initialHasMore={hasMore}
        fetchPage={fetchPage}
        pageHref={(visiblePage) =>
          sourceBrowseHref(sourceKey, visiblePage, { view, q, category })
        }
        renderPage={(pageItems, pageNumber) => (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {pageItems.map((raw, index) => {
              const item = withPatch(raw);
              const previewId = item.bookId ?? item.existingTitle?.id ?? null;
              return (
                <SourceBrowseCard
                  key={`${item.id}-${index}`}
                  sourceKey={sourceKey}
                  item={item}
                  isAdmin={isAdmin}
                  priority={pageNumber === 1 && index < 8}
                  coverReferer={coverReferer}
                  onSelect={
                    previewId ? () => setSelectedBookId(previewId) : undefined
                  }
                  onAddedToStore={(bookId) =>
                    setPatches((prev) => ({
                      ...prev,
                      [item.id]: {
                        ...prev[item.id],
                        inCatalog: true,
                        bookId,
                      },
                    }))
                  }
                  onAddedToLibrary={() =>
                    setPatches((prev) => ({
                      ...prev,
                      [item.id]: { ...prev[item.id], inLibrary: true },
                    }))
                  }
                />
              );
            })}
          </div>
        )}
      />

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
  onAddedToStore,
  onAddedToLibrary,
}: {
  sourceKey: string;
  item: SourceBrowseItem;
  isAdmin: boolean;
  priority: boolean;
  coverReferer?: string;
  onSelect?: () => void;
  onAddedToStore?: (bookId: string) => void;
  onAddedToLibrary?: () => void;
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
        <AddToLibraryButton
          bookId={item.bookId}
          inLibrary={item.inLibrary}
          onAdded={onAddedToLibrary}
        />
      ) : isAdmin ? (
        <AddToStoreButton
          sourceKey={sourceKey}
          titleId={item.id}
          onAdded={onAddedToStore}
        />
      ) : item.existingTitle ? (
        <AddToLibraryButton
          bookId={item.existingTitle.id}
          inLibrary={item.inLibrary}
          onAdded={onAddedToLibrary}
        />
      ) : (
        <p className="text-xs text-zinc-500">Not in the store yet</p>
      )}
    </div>
  );
}
