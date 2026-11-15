"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useLibraryCaughtUp } from "@/components/library-caught-up-provider";
import { LibraryBookGrid } from "@/components/library-book-grid";
import {
  libraryBooksApiPath,
  libraryPageHref,
  type LibraryHrefParams,
  type LibraryPageResult,
  type LibraryUserBook,
} from "@/lib/library-query";

type LibraryView = {
  items: LibraryUserBook[];
  total: number;
  page: number;
  hasMore: boolean;
  revision: number;
};

type LibraryLiveResultsProps = {
  initial: LibraryPageResult;
  serverOnlyCaughtUp: boolean;
  filterParams: LibraryHrefParams;
  showEntryMeta: boolean;
  showAdminControls: boolean;
  hideAdult: boolean;
  librarySize: number;
  totalCount: number;
  totalCaughtUpCount: number;
  collectionLabel?: string;
  typeLabel?: string;
  statusLabel?: string | null;
  publicationLabel?: string | null;
  queryLabel?: string;
};

export function LibraryLiveResults({
  initial,
  serverOnlyCaughtUp,
  filterParams,
  showEntryMeta,
  showAdminControls,
  hideAdult,
  librarySize,
  totalCount,
  totalCaughtUpCount,
  collectionLabel,
  typeLabel,
  statusLabel,
  publicationLabel,
  queryLabel,
}: LibraryLiveResultsProps) {
  const { onlyCaughtUp, setOnlyCaughtUp } = useLibraryCaughtUp();
  const [view, setView] = useState<LibraryView>({
    items: initial.items,
    total: initial.total,
    page: initial.page,
    hasMore: initial.hasMore,
    revision: 0,
  });
  const [appliedOnly, setAppliedOnly] = useState(serverOnlyCaughtUp);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const filterKey = libraryPageHref(filterParams);
  const pending = onlyCaughtUp !== appliedOnly;

  useEffect(() => {
    if (!pending) return;

    const requestId = ++requestRef.current;
    const controller = new AbortController();
    setError(null);

    void (async () => {
      try {
        const response = await fetch(
          libraryBooksApiPath(filterParams, 1, onlyCaughtUp),
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Failed to load library");
        const data = (await response.json()) as LibraryPageResult;
        if (requestId !== requestRef.current) return;
        setAppliedOnly(onlyCaughtUp);
        setView((current) => ({
          items: data.items,
          total: data.total,
          page: data.page,
          hasMore: data.hasMore,
          revision: current.revision + 1,
        }));
      } catch {
        if (controller.signal.aborted) return;
        if (requestId !== requestRef.current) return;
        setError("Could not update the library. The previous list is still showing.");
        setOnlyCaughtUp(appliedOnly);
      }
    })();

    return () => controller.abort();
  }, [appliedOnly, filterKey, filterParams, onlyCaughtUp, pending, setOnlyCaughtUp]);

  const visibleLibrary = onlyCaughtUp
    ? totalCaughtUpCount
    : Math.max(0, totalCount - totalCaughtUpCount);

  if (view.total === 0 && !pending) {
    return (
      <div className="space-y-3">
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-12 text-center">
          <p className="text-zinc-400">
            {librarySize === 0
              ? "Your library is empty."
              : hideAdult && totalCount === 0
                ? "Adult titles are hidden."
                : onlyCaughtUp && visibleLibrary === 0
                  ? "No titles with no new chapters are in your library."
                  : !onlyCaughtUp && visibleLibrary === 0
                    ? "Every title in view has no chapters left. Turn on No new chapters to see them."
                    : queryLabel
                      ? `No titles match “${queryLabel}”.`
                      : onlyCaughtUp
                        ? "No titles with no new chapters match these filters."
                        : "No titles match these filters."}
          </p>
          {hideAdult && librarySize > 0 && totalCount === 0 ? (
            <Link
              href="/account"
              className="mt-2 inline-block text-sm text-violet-400 hover:text-violet-300"
            >
              Change adult-content setting
            </Link>
          ) : (
            <Link
              href={
                librarySize === 0
                  ? "/library/add"
                  : libraryPageHref({ ...filterParams, q: undefined })
              }
              className="mt-2 inline-block text-sm text-violet-400 hover:text-violet-300"
            >
              {librarySize === 0
                ? "Browse the store"
                : queryLabel
                  ? "Clear search"
                  : "Clear filters"}
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-zinc-400">
        {pending ? "Updating library…" : (
          <>
            {view.total.toLocaleString()} title
            {view.total === 1 ? "" : "s"}
            {collectionLabel ? ` in ${collectionLabel}` : ""}
            {typeLabel ? ` · ${typeLabel}` : ""}
            {statusLabel ? ` · ${statusLabel}` : ""}
            {publicationLabel ? ` · ${publicationLabel}` : ""}
            {queryLabel ? ` matching “${queryLabel}”` : ""}
            {visibleLibrary > 0 && view.total !== visibleLibrary && (
              <span className="text-zinc-500">
                {" "}
                ({visibleLibrary.toLocaleString()} total)
              </span>
            )}
          </>
        )}
      </p>
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className={pending ? "opacity-70 transition-opacity" : undefined}>
        <LibraryBookGrid
          items={view.items}
          page={view.page}
          hasMore={pending ? false : view.hasMore}
          filterParams={filterParams}
          onlyCaughtUp={onlyCaughtUp}
          listKey={String(view.revision)}
          showEntryMeta={showEntryMeta}
          showAdminControls={showAdminControls}
        />
      </div>
    </div>
  );
}
