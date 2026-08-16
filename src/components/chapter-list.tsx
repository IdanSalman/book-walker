"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BookOpen, ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import type { ReaderChapter } from "@/lib/reader/types";
import { continueChapterIndex } from "@/lib/reader/types";
import { readerChapterHref } from "@/lib/reader/source-id";
import { cn } from "@/lib/utils";

export function ChapterList({
  bookId,
  chapters,
  currentPage,
  sourceName,
}: {
  bookId: string;
  chapters: ReaderChapter[];
  currentPage: number;
  sourceName?: string | null;
}) {
  const [newestFirst, setNewestFirst] = useState(true);

  const continueIndex = continueChapterIndex(currentPage, chapters.length);
  const continueChapter = chapters[continueIndex];

  const ordered = useMemo(
    () => (newestFirst ? [...chapters].reverse() : chapters),
    [chapters, newestFirst],
  );

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
        {ordered.map((chapter, displayIndex) => {
          const sourceIndex = newestFirst
            ? chapters.length - 1 - displayIndex
            : displayIndex;
          const read = currentPage > 0 && sourceIndex < currentPage;
          const current = sourceIndex === continueIndex && currentPage > 0;

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
