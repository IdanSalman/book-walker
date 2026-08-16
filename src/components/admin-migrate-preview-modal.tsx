"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { CoverImage } from "@/components/cover-image";
import { OpenOnSourceLink } from "@/components/open-on-source-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { previewBookMigration } from "@/lib/actions/sources";
import { coverRefererForHost } from "@/lib/cover-url";
import {
  PUBLICATION_STATUS_LABELS,
  isOngoingPublication,
} from "@/lib/publication";
import type {
  MigrationCandidate,
  MigrationPreview,
} from "@/lib/sources/migrate";

function coverReferer(url: string | null): string | undefined {
  if (!url) return undefined;
  try {
    return coverRefererForHost(new URL(url).hostname);
  } catch {
    return undefined;
  }
}

function formatPublished(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function AdminMigratePreviewModal({
  candidate,
  fromSourceName,
  migrating,
  onClose,
  onMigrate,
}: {
  candidate: MigrationCandidate;
  fromSourceName: string;
  migrating: boolean;
  onClose: () => void;
  onMigrate: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<MigrationPreview | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPreview(null);
    void previewBookMigration(candidate.sourceKey, candidate.id, {
      title: candidate.title,
      url: candidate.url,
    }).then(
      (result) => {
        if (cancelled) return;
        if (result.error || !result.preview) {
          setError(result.error ?? "Could not load listing");
          setLoading(false);
          return;
        }
        setPreview(result.preview);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [candidate.sourceKey, candidate.id]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);

    const html = document.documentElement;
    const scrollY = window.scrollY;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyWidth = document.body.style.width;

    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      html.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.width = previousBodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, [onClose]);

  if (!mounted) return null;

  const title = preview?.title ?? candidate.title;
  const coverUrl = preview?.coverUrl ?? candidate.coverUrl;

  return createPortal(
    <div className="fixed inset-0 z-[60] h-dvh w-full">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
      />
      <div
        className="relative flex h-full min-h-dvh items-center justify-center p-4"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="migrate-preview-title"
          className="flex max-h-[min(90dvh,calc(100dvh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
            <h2
              id="migrate-preview-title"
              className="text-lg font-semibold text-zinc-100"
            >
              Migrate to {candidate.sourceName}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
            {loading ? (
              <p className="py-12 text-center text-zinc-400">
                Loading listing and latest chapters…
              </p>
            ) : error ? (
              <p className="py-12 text-center text-red-300">{error}</p>
            ) : preview ? (
              <div className="grid gap-6 sm:grid-cols-[140px_1fr]">
                <div className="space-y-3">
                  <div className="relative mx-auto aspect-[2/3] w-full max-w-[140px] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
                    <CoverImage
                      src={coverUrl}
                      alt={title}
                      sizes="140px"
                      size={256}
                      referer={coverReferer(coverUrl)}
                    />
                  </div>
                  {preview.url && (
                    <OpenOnSourceLink
                      href={preview.url}
                      sourceName={preview.sourceName}
                    />
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="text-xl font-bold text-zinc-50">{title}</h3>
                    <p className="mt-1 text-sm text-zinc-400">
                      From {fromSourceName} to {preview.sourceName}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {preview.publicationStatus !== "UNKNOWN" && (
                      <Badge
                        className={
                          isOngoingPublication(preview.publicationStatus)
                            ? "border-sky-900/50 bg-sky-950/50 text-sky-300"
                            : preview.publicationStatus === "COMPLETED"
                              ? "border-emerald-900/50 bg-emerald-950/50 text-emerald-300"
                              : undefined
                        }
                      >
                        {PUBLICATION_STATUS_LABELS[preview.publicationStatus]}
                      </Badge>
                    )}
                    {preview.isAdult && (
                      <Badge className="border-red-900/50 bg-red-950/50 text-red-300">
                        Adult
                      </Badge>
                    )}
                    {preview.year && <Badge>{preview.year}</Badge>}
                  </div>

                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    {preview.author && (
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-zinc-500">
                          Author
                        </dt>
                        <dd className="mt-0.5 text-zinc-200">{preview.author}</dd>
                      </div>
                    )}
                    {preview.artist && (
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-zinc-500">
                          Artist
                        </dt>
                        <dd className="mt-0.5 text-zinc-200">{preview.artist}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">
                        Chapters
                      </dt>
                      <dd className="mt-0.5 text-zinc-200">
                        {preview.chapterCount > 0
                          ? `${preview.chapterCount.toLocaleString()} on ${preview.sourceName}`
                          : preview.lastChapter
                            ? `Latest listed: Ch. ${preview.lastChapter}`
                            : "Unknown"}
                      </dd>
                    </div>
                  </dl>

                  {preview.genres.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {preview.genres.slice(0, 8).map((genre) => (
                        <Badge key={genre}>{genre}</Badge>
                      ))}
                    </div>
                  )}

                  {preview.summary && (
                    <p className="whitespace-pre-wrap text-sm text-zinc-300">
                      {preview.summary.length > 600
                        ? `${preview.summary.slice(0, 600).trim()}…`
                        : preview.summary}
                    </p>
                  )}

                  <div>
                    <h4 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
                      Latest chapters
                    </h4>
                    {preview.chaptersError ? (
                      <p className="mt-2 text-sm text-amber-200/90">
                        {preview.chaptersError}
                      </p>
                    ) : preview.latestChapters.length === 0 ? (
                      <p className="mt-2 text-sm text-zinc-400">
                        No readable chapters were returned.
                      </p>
                    ) : (
                      <ol className="mt-2 divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800">
                        {preview.latestChapters.map((chapter, index) => (
                          <li
                            key={`${chapter.name}-${index}`}
                            className="px-3 py-2"
                          >
                            <p className="text-sm text-zinc-100">
                              {chapter.name}
                            </p>
                            <p className="mt-0.5 text-xs text-zinc-500">
                              {[
                                chapter.scanlationGroup,
                                chapter.pageCount
                                  ? `${chapter.pageCount} pages`
                                  : null,
                                formatPublished(chapter.publishedAt),
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-800 px-5 py-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={migrating || loading || !preview}
              onClick={onMigrate}
            >
              {migrating
                ? "Moving…"
                : `Migrate to ${candidate.sourceName}`}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
