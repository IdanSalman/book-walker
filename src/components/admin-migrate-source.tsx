"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ArrowRightLeft, X } from "lucide-react";

import { AdminMigratePreviewModal } from "@/components/admin-migrate-preview-modal";
import { CoverImage } from "@/components/cover-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { coverRefererForHost } from "@/lib/cover-url";
import {
  getMigrationSources,
  migrateBookToSource,
  searchBookMigration,
} from "@/lib/actions/sources";
import type { MigrationCandidate, MigrationSource } from "@/lib/sources/migrate";

function coverReferer(url: string | null): string | undefined {
  if (!url) return undefined;
  try {
    return coverRefererForHost(new URL(url).hostname);
  } catch {
    return undefined;
  }
}

export function AdminMigrateSource({
  bookId,
  bookTitle,
  sourceName,
  onUpdated,
}: {
  bookId: string;
  bookTitle: string;
  sourceName: string | null;
  onUpdated?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sources, setSources] = useState<MigrationSource[]>([]);
  const [sourceKey, setSourceKey] = useState("");
  const [query, setQuery] = useState(bookTitle);
  const [candidates, setCandidates] = useState<MigrationCandidate[] | null>(
    null,
  );
  const [preview, setPreview] = useState<MigrationCandidate | null>(null);
  const [migratingId, setMigratingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getMigrationSources(bookId).then((result) => {
      if (cancelled) return;
      if (result.error) setError(result.error);
      setSources(result.sources);
    });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  function search() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await searchBookMigration(
        bookId,
        query,
        sourceKey || undefined,
      );
      if (result.error) {
        setError(result.error);
        setCandidates([]);
        return;
      }
      setCandidates(result.candidates);
    });
  }

  function migrate(candidate: MigrationCandidate) {
    setMessage(null);
    setError(null);
    setMigratingId(`${candidate.sourceKey}:${candidate.id}`);
    startTransition(async () => {
      const result = await migrateBookToSource(
        bookId,
        candidate.sourceKey,
        candidate.id,
      );
      setMigratingId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.conflict) {
        setError(
          `${result.conflict.title} is already in the store from ${result.conflict.sourceName}.`,
        );
        return;
      }
      setMessage(
        result.message ?? `Moved ${bookTitle} to ${candidate.sourceName}`,
      );
      setPreview(null);
      setCandidates(null);
      onUpdated?.();
      router.refresh();
    });
  }

  const from = sourceName?.trim() || "the current source";

  return (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-medium text-zinc-200">
          <ArrowRightLeft className="h-4 w-4" />
          Migrate source
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          Move this listing from {from} to another scanlation site. Click a
          match to inspect it before migrating. Library progress and date added
          stay with the title.
        </p>
      </div>

      <form
        className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          search();
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="migrate-query">Search title</Label>
          <Input
            id="migrate-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Title on the other source"
            disabled={pending}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="migrate-source">Source</Label>
          <Select
            id="migrate-source"
            value={sourceKey}
            onChange={(event) => setSourceKey(event.target.value)}
            disabled={pending || sources.length === 0}
          >
            <option value="">All sources</option>
            {sources.map((source) => (
              <option key={source.key} value={source.key}>
                {source.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-end">
          <Button type="submit" variant="outline" disabled={pending}>
            {pending && !migratingId ? "Searching…" : "Search"}
          </Button>
        </div>
      </form>

      {candidates && (
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <div className="flex items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-950/60 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {candidates.length === 0
                ? "No matches"
                : `${candidates.length.toLocaleString()} match${
                    candidates.length === 1 ? "" : "es"
                  }`}
            </p>
            <button
              type="button"
              onClick={() => {
                setCandidates(null);
                setPreview(null);
              }}
              className="rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
              aria-label="Close search results"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {candidates.length === 0 ? (
            <p className="px-3 py-3 text-sm text-zinc-400">
              No other listings matched that title.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {candidates.map((candidate) => {
                const key = `${candidate.sourceKey}:${candidate.id}`;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-zinc-800/70"
                      onClick={() => {
                        setMessage(null);
                        setError(null);
                        setPreview(candidate);
                      }}
                    >
                      <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-zinc-800">
                        <CoverImage
                          src={candidate.coverUrl}
                          alt={candidate.title}
                          sizes="40px"
                          referer={coverReferer(candidate.coverUrl)}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-100">
                          {candidate.title}
                        </p>
                        <p className="truncate text-xs text-zinc-500">
                          {[
                            candidate.sourceName,
                            candidate.author,
                            candidate.lastChapter
                              ? `Ch. ${candidate.lastChapter}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {message && <p className="text-sm text-emerald-400">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {preview && (
        <AdminMigratePreviewModal
          candidate={preview}
          fromSourceName={from}
          migrating={pending && migratingId === `${preview.sourceKey}:${preview.id}`}
          onClose={() => setPreview(null)}
          onMigrate={() => migrate(preview)}
        />
      )}
    </div>
  );
}
