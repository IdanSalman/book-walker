"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { CoverImage } from "@/components/cover-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  importSourceTitles,
  searchSourceCatalog,
  type SourceSearchResult,
} from "@/lib/actions/sources";
import { PUBLICATION_STATUS_LABELS } from "@/lib/publication";
import { cn } from "@/lib/utils";

export function AdminSourceImportPanel({
  sourceId,
  sourceName,
  coverReferer,
}: {
  sourceId: string;
  sourceName: string;
  coverReferer?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SourceSearchResult[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [searching, startSearch] = useTransition();
  const [importing, startImport] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function search(term: string) {
    setMessage(null);
    setError(null);
    setSelected([]);
    startSearch(async () => {
      const result = await searchSourceCatalog(sourceId, term);
      if (result.error) {
        setError(result.error);
        setResults(null);
        return;
      }
      setResults(result.results ?? []);
    });
  }

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  function runImport() {
    setMessage(null);
    setError(null);
    startImport(async () => {
      const result = await importSourceTitles(sourceId, selected);
      if (result.error) setError(result.error);
      if (result.message) setMessage(result.message);
      if (result.success) {
        setResults(
          (current) =>
            current?.map((candidate) =>
              selected.includes(candidate.id)
                ? { ...candidate, inCatalog: true }
                : candidate,
            ) ?? null,
        );
        setSelected([]);
        router.refresh();
      }
    });
  }

  return (
    <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Fetch titles from {sourceName}
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Search by title, or paste a {sourceName} URL or ID. Imported titles land
          in the shared catalog; titles already there are refreshed.
        </p>
      </div>

      <form
        className="flex flex-wrap gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          search(query);
        }}
      >
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Title, or a ${sourceName} URL`}
          className="max-w-md flex-1"
        />
        <Button type="submit" disabled={searching}>
          {searching ? "Searching…" : "Search"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={searching}
          onClick={() => {
            setQuery("");
            search("");
          }}
        >
          Browse popular
        </Button>
      </form>

      {message && <p className="text-sm text-emerald-400">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {results && results.length === 0 && (
        <p className="rounded-lg border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-400">
          No titles matched that search.
        </p>
      )}

      {results && results.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {results.map((candidate) => {
              const isSelected = selected.includes(candidate.id);
              return (
                <label
                  key={candidate.id}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-lg border p-3 transition",
                    isSelected
                      ? "border-violet-600 bg-violet-950/30"
                      : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 accent-violet-600"
                    checked={isSelected}
                    onChange={() => toggle(candidate.id)}
                  />
                  <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded bg-zinc-800">
                    <CoverImage
                      src={candidate.coverUrl}
                      alt=""
                      sizes="56px"
                      size={256}
                      referer={coverReferer}
                    />
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <p className="line-clamp-2 text-sm font-medium text-zinc-100">
                      {candidate.title}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {[
                        candidate.year ? String(candidate.year) : null,
                        PUBLICATION_STATUS_LABELS[candidate.publicationStatus],
                        candidate.lastChapter
                          ? `Ch. ${candidate.lastChapter}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {candidate.inCatalog && (
                        <Badge className="border-sky-900/50 bg-sky-950/50 text-sky-300">
                          In catalog
                        </Badge>
                      )}
                      {candidate.isAdult && (
                        <Badge className="border-red-900/50 bg-red-950/50 text-red-300">
                          Adult
                        </Badge>
                      )}
                      {candidate.genres.slice(0, 2).map((genre) => (
                        <Badge key={genre}>{genre}</Badge>
                      ))}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800 pt-4">
            <Button
              type="button"
              disabled={importing || selected.length === 0}
              onClick={runImport}
            >
              {importing
                ? "Importing…"
                : `Import selected${selected.length > 0 ? ` (${selected.length})` : ""}`}
            </Button>
            {selected.length > 0 && (
              <button
                type="button"
                className="text-xs text-zinc-400 transition hover:text-zinc-200"
                onClick={() => setSelected([])}
              >
                Clear selection
              </button>
            )}
            <p className="text-xs text-zinc-500">Up to 20 titles per import.</p>
          </div>
        </>
      )}
    </section>
  );
}
