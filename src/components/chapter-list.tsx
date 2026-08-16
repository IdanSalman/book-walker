"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BookOpen, ChevronDown } from "lucide-react";

import { OpenOnSourceLink } from "@/components/open-on-source-link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  chapterListRows,
  continueChapterIndex,
  formatChapterGap,
  gapSize,
  isChapterRead,
  missingChapterCount,
} from "@/lib/reader/chapter-progress";
import type { ReaderChapter } from "@/lib/reader/types";
import { readerChapterHref } from "@/lib/reader/source-id";
import { cn } from "@/lib/utils";

export function ChapterList({
  bookId,
  chapters,
  currentPage,
  sourceName,
  sourceUrl,
}: {
  bookId: string;
  chapters: ReaderChapter[];
  currentPage: number;
  sourceName?: string | null;
  sourceUrl?: string | null;
}) {
  const [newestFirst, setNewestFirst] = useState(true);

  const continueIndex = continueChapterIndex(currentPage, chapters);
  const continueChapter = chapters[continueIndex];
  const missingCount = useMemo(
    () => missingChapterCount(chapters),
    [chapters],
  );
  const orderedRows = useMemo(() => {
    const rows = chapterListRows(chapters);
    return newestFirst ? [...rows].reverse() : rows;
  }, [chapters, newestFirst]);

  if (chapters.length === 0) {
    return (
      <p className="text-sm text-zinc-400">
        No readable chapters were found on the enabled sources for this title.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Chapters
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            {chapters.length.toLocaleString()} chapter
            {chapters.length === 1 ? "" : "s"}
            {sourceName ? ` · ${sourceName}` : ""}
            {missingCount > 0
              ? ` · ${missingCount.toLocaleString()} missing chapter${missingCount === 1 ? "" : "s"}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {continueChapter && (
            <Link
              href={readerChapterHref(bookId, continueChapter.id)}
              className={buttonVariants({ size: "sm" })}
            >
              <BookOpen className="h-4 w-4" />
              {currentPage > 0 ? "Continue reading" : "Start reading"}
            </Link>
          )}
          {sourceUrl && (
            <OpenOnSourceLink href={sourceUrl} sourceName={sourceName} />
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setNewestFirst((value) => !value)}
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition",
                newestFirst ? "rotate-0" : "rotate-180",
              )}
            />
            {newestFirst ? "Newest" : "Oldest"}
          </Button>
        </div>
      </div>

      <ol className="max-h-[70vh] divide-y divide-zinc-800 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900/50">
        {orderedRows.map((row) => {
          if (row.type === "gap") {
            const count = gapSize(row.gap);
            return (
              <li
                key={`gap-${row.gap.start}-${row.gap.end}`}
                className="flex items-center justify-between gap-3 bg-amber-950/20 px-4 py-2.5"
              >
                <p className="text-xs font-medium text-amber-200/90">
                  {formatChapterGap(row.gap)}
                </p>
                <Badge className="shrink-0 border-amber-800/80 bg-amber-950/70 text-amber-100">
                  {count} missing
                </Badge>
              </li>
            );
          }

          const { chapter, sourceIndex } = row;
          const read = isChapterRead(chapter, currentPage, sourceIndex);
          const current =
            sourceIndex === continueIndex && currentPage > 0 && !read;

          return (
            <li key={chapter.id}>
              <Link
                href={readerChapterHref(bookId, chapter.id)}
                className={cn(
                  "flex items-start justify-between gap-3 px-4 py-3 transition hover:bg-zinc-800/70",
                  current && "bg-violet-950/30",
                )}
              >
                <div className="min-w-0">
                  <p
                    className={cn(
                      "truncate text-sm font-medium",
                      read ? "text-zinc-400" : "text-zinc-100",
                    )}
                  >
                    {chapter.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {[
                      chapter.scanlationGroup,
                      chapter.pageCount
                        ? `${chapter.pageCount} pages`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {current && (
                  <Badge className="shrink-0 border-violet-800 bg-violet-950/80 text-violet-200">
                    Current
                  </Badge>
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
