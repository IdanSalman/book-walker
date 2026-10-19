"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { PagedInfiniteList } from "@/components/paged-infinite-list";
import { SourceBrowseCard } from "@/components/source-browse-grid";
import { BookDetailModal } from "@/components/book-detail-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BrowsableSource } from "@/lib/sources/browsable";
import {
  SOURCE_BROWSE_SORT_OPTIONS,
  sourceBrowseHref,
  type SourceBrowseItem,
  type SourceBrowseSort,
} from "@/lib/sources/browse";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "book-walker.market-source-keys";

type Panel = "sources" | SourceBrowseSort;

type ActiveSearch =
  | { kind: "text"; query: string }
  | { kind: "listing"; view: SourceBrowseSort; sourceKey: string };

type SourceHit = {
  source: BrowsableSource;
  items: SourceBrowseItem[];
  hasMore: boolean;
  error?: string;
};

type BrowsePayload = {
  items: SourceBrowseItem[];
  hasMore: boolean;
  error?: string;
};

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

async function fetchSourcePage(
  key: string,
  params: { q?: string; view?: string; page?: number },
  signal?: AbortSignal,
): Promise<BrowsePayload> {
  const search = new URLSearchParams();
  if (params.view) search.set("view", params.view);
  if (params.q) search.set("q", params.q);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const response = await fetch(
    `/api/sources/${encodeURIComponent(key)}/browse?${search}`,
    { signal, cache: "no-store" },
  );
  let body: BrowsePayload | null = null;
  try {
    body = (await response.json()) as BrowsePayload;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(body?.error || "Could not load titles");
  }
  if (!body || !Array.isArray(body.items)) {
    throw new Error("Could not load titles");
  }
  return body;
}

export function MarketSourceSearch({
  sources,
  isAdmin,
  children,
}: {
  sources: BrowsableSource[];
  isAdmin: boolean;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runRef = useRef(0);
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const skipPersist = useRef(true);

  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState<string[]>(() =>
    sources.map((source) => source.key),
  );
  const [panel, setPanel] = useState<Panel | null>(null);
  const [sourceFilter, setSourceFilter] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveSearch | null>(null);
  const [pending, setPending] = useState<BrowsableSource[]>([]);
  const [hits, setHits] = useState<SourceHit[]>([]);
  const [searchToken, setSearchToken] = useState(0);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedCount = sources.filter((source) =>
    selectedSet.has(source.key),
  ).length;

  useEffect(() => {
    const known = new Set(sourcesRef.current.map((source) => source.key));
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      setSelected(
        parsed.filter(
          (key): key is string => typeof key === "string" && known.has(key),
        ),
      );
    } catch {
      // Keep every source selected when stored data cannot be read.
    }
  }, []);

  useEffect(() => {
    if (skipPersist.current) {
      skipPersist.current = false;
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selected));
  }, [selected]);

  useEffect(() => {
    if (!panel) return;
    function onPointerDown(event: PointerEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        setPanel(null);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPanel(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [panel]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (sources.length === 0) return children;

  function togglePanel(next: Panel) {
    setSourceFilter("");
    setPanel((current) => (current === next ? null : next));
  }

  function beginRun(targets: BrowsableSource[], next: ActiveSearch) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const runId = runRef.current + 1;
    runRef.current = runId;
    setSearchToken(runId);
    setActive(next);
    setHits([]);
    setPending(targets);
    setNotice(null);
    setPanel(null);

    const query = next.kind === "text" ? next.query : undefined;
    const view = next.kind === "listing" ? next.view : undefined;

    for (const source of targets) {
      void fetchSourcePage(
        source.key,
        { q: query, view },
        controller.signal,
      )
        .then((result) => {
          if (runRef.current !== runId) return;
          setHits((prev) => [
            ...prev.filter((hit) => hit.source.key !== source.key),
            {
              source,
              items: result.items,
              hasMore: result.hasMore,
            },
          ]);
        })
        .catch((err: unknown) => {
          if (runRef.current !== runId || isAbort(err)) return;
          const message =
            err instanceof Error ? err.message : "Could not load titles";
          setHits((prev) => [
            ...prev.filter((hit) => hit.source.key !== source.key),
            {
              source,
              items: [],
              hasMore: false,
              error: message,
            },
          ]);
        })
        .finally(() => {
          if (runRef.current !== runId) return;
          setPending((prev) => prev.filter((item) => item.key !== source.key));
        });
    }
  }

  function submitText(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = draft.trim();
    if (!query) {
      setNotice("Enter a title to search.");
      return;
    }
    const targets = sources.filter((source) => selectedSet.has(source.key));
    if (targets.length === 0) {
      setNotice("Select at least one source.");
      setPanel("sources");
      return;
    }
    beginRun(targets, { kind: "text", query });
  }

  function openListing(view: SourceBrowseSort, source: BrowsableSource) {
    beginRun([source], { kind: "listing", view, sourceKey: source.key });
  }

  function showCatalog() {
    abortRef.current?.abort();
    runRef.current += 1;
    setPending([]);
    setHits([]);
    setActive(null);
    setNotice(null);
    setPanel(null);
  }

  const needle = sourceFilter.trim().toLowerCase();
  const visibleSources = needle
    ? sources.filter((source) => source.name.toLowerCase().includes(needle))
    : sources;
  const listingLabel =
    active?.kind === "listing"
      ? SOURCE_BROWSE_SORT_OPTIONS.find((option) => option.value === active.view)
          ?.label
      : null;
  const listingSource =
    active?.kind === "listing"
      ? sources.find((source) => source.key === active.sourceKey)
      : null;

  return (
    <div className="space-y-6">
      <div
        ref={panelRef}
        className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"
      >
        <div>
          <h2 className="text-sm font-medium text-zinc-200">Search sources</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Search several sites at once, or open Popular, Latest additions,
            and Updated recently on one source. Results show up as each site
            responds.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <form onSubmit={submitText} className="flex min-w-0 flex-1 gap-2">
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Search titles across sources…"
              aria-label="Search titles across sources"
            />
            <Button type="submit">Search</Button>
          </form>
          <Button
            type="button"
            variant={panel === "sources" ? "default" : "outline"}
            aria-expanded={panel === "sources"}
            onClick={() => togglePanel("sources")}
          >
            Sources ({selectedCount}/{sources.length})
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-zinc-500">Browse:</span>
          {SOURCE_BROWSE_SORT_OPTIONS.map((option) => (
            <ChoiceButton
              key={option.value}
              active={
                panel === option.value ||
                (active?.kind === "listing" && active.view === option.value)
              }
              pressed={panel === option.value}
              onClick={() => togglePanel(option.value)}
            >
              {option.label}
            </ChoiceButton>
          ))}
        </div>

        {notice && <p className="text-sm text-amber-300">{notice}</p>}

        {panel && (
          <SourcePicker
            panel={panel}
            sources={visibleSources}
            sourceFilter={sourceFilter}
            onFilter={setSourceFilter}
            selectedSet={selectedSet}
            onToggle={(key) =>
              setSelected((prev) =>
                prev.includes(key)
                  ? prev.filter((item) => item !== key)
                  : [...prev, key],
              )
            }
            onSelectAll={() => setSelected(sources.map((source) => source.key))}
            onClear={() => setSelected([])}
            onPickListing={(source) => {
              if (panel === "sources") return;
              openListing(panel, source);
            }}
          />
        )}
      </div>

      {active ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-zinc-300">
              {active.kind === "text"
                ? `Results for “${active.query}”`
                : listingSource
                  ? `${listingLabel} on ${listingSource.name}`
                  : listingLabel}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={showCatalog}
            >
              Back to catalog
            </Button>
          </div>

          {pending.length > 0 && (
            <p className="text-sm text-zinc-400" role="status">
              Searching {pending.map((source) => source.name).join(", ")}…
            </p>
          )}

          {hits.length === 0 && pending.length === 0 && (
            <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-12 text-center">
              <p className="text-zinc-400">No sources returned titles.</p>
            </div>
          )}

          <div className="space-y-5">
            {hits.map((hit) => (
              <MarketSourceSection
                key={`${searchToken}:${hit.source.key}`}
                hit={hit}
                query={active.kind === "text" ? active.query : undefined}
                view={active.kind === "listing" ? active.view : undefined}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function ChoiceButton({
  active,
  pressed,
  onClick,
  children,
}: {
  active: boolean;
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-sm",
        active
          ? "bg-violet-600 font-medium text-white"
          : "border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200",
      )}
    >
      {children}
    </button>
  );
}

function SourcePicker({
  panel,
  sources,
  sourceFilter,
  onFilter,
  selectedSet,
  onToggle,
  onSelectAll,
  onClear,
  onPickListing,
}: {
  panel: Panel;
  sources: BrowsableSource[];
  sourceFilter: string;
  onFilter: (value: string) => void;
  selectedSet: Set<string>;
  onToggle: (key: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onPickListing: (source: BrowsableSource) => void;
}) {
  const filterId = useId();
  const listing = panel !== "sources";

  return (
    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-300">
          {listing ? "Choose a source" : "Sources to search"}
        </p>
        {!listing && (
          <div className="flex gap-2">
            <button
              type="button"
              className="text-xs text-violet-400 hover:text-violet-300"
              onClick={onSelectAll}
            >
              Select all
            </button>
            <button
              type="button"
              className="text-xs text-zinc-500 hover:text-zinc-300"
              onClick={onClear}
            >
              Clear
            </button>
          </div>
        )}
      </div>
      <Input
        id={filterId}
        value={sourceFilter}
        onChange={(event) => onFilter(event.target.value)}
        placeholder="Filter sources…"
        aria-label="Filter sources"
      />
      {sources.length === 0 ? (
        <p className="text-sm text-zinc-500">No sources match.</p>
      ) : (
        <div className="grid max-h-64 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
          {sources.map((source) =>
            listing ? (
              <button
                key={source.key}
                type="button"
                onClick={() => onPickListing(source)}
                className="rounded-lg px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
              >
                {source.name}
              </button>
            ) : (
              <label
                key={source.key}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 hover:bg-zinc-800"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-violet-500"
                  checked={selectedSet.has(source.key)}
                  onChange={() => onToggle(source.key)}
                />
                <span className="text-sm text-zinc-200">{source.name}</span>
              </label>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function MarketSourceSection({
  hit,
  query,
  view,
  isAdmin,
}: {
  hit: SourceHit;
  query?: string;
  view?: string;
  isAdmin: boolean;
}) {
  const [patches, setPatches] = useState<
    Record<string, Partial<SourceBrowseItem>>
  >({});
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);

  const href = sourceBrowseHref(hit.source.key, 1, {
    view: view && view !== "popular" ? view : undefined,
    q: query,
  });

  function withPatch(item: SourceBrowseItem): SourceBrowseItem {
    const patch = patches[item.id];
    return patch ? { ...item, ...patch } : item;
  }

  const fetchPage = useCallback(
    async (nextPage: number) => {
      const result = await fetchSourcePage(hit.source.key, {
        q: query,
        view,
        page: nextPage,
      });
      return { items: result.items, hasMore: result.hasMore };
    },
    [hit.source.key, query, view],
  );

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-800">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900/80 px-4 py-3">
        <h3 className="text-base font-semibold text-zinc-50">
          <Link href={href} className="hover:text-violet-300">
            {hit.source.name}
          </Link>
        </h3>
        <Link
          href={href}
          className="shrink-0 text-sm text-violet-400 hover:text-violet-300"
        >
          Open source
        </Link>
      </div>
      <div className="space-y-4 p-4">
        {hit.error ? (
          <p className="text-sm text-zinc-400">{hit.error}</p>
        ) : hit.items.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No titles from {hit.source.name}.
          </p>
        ) : (
          <PagedInfiniteList
            resetKey={`${hit.source.key}:${view ?? ""}:${query ?? ""}`}
            initialPage={1}
            initialItems={hit.items}
            initialHasMore={hit.hasMore}
            fetchPage={fetchPage}
            renderPage={(pageItems, pageNumber) => (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {pageItems.map((raw, index) => {
                  const item = withPatch(raw);
                  const previewId =
                    item.bookId ?? item.existingTitle?.id ?? null;
                  return (
                    <SourceBrowseCard
                      key={`${item.id}-${index}`}
                      sourceKey={hit.source.key}
                      item={item}
                      isAdmin={isAdmin}
                      priority={pageNumber === 1 && index < 4}
                      coverReferer={hit.source.coverReferer}
                      onSelect={
                        previewId
                          ? () => setSelectedBookId(previewId)
                          : undefined
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
        )}
      </div>
      {selectedBookId && (
        <BookDetailModal
          bookId={selectedBookId}
          onClose={() => setSelectedBookId(null)}
        />
      )}
    </section>
  );
}
