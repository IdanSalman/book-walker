"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  GalleryVertical,
  List,
  Loader2,
  PanelLeft,
  PanelRight,
} from "lucide-react";

import { PdfPageView, prefetchPdfPage } from "@/components/pdf-page-view";
import { Button } from "@/components/ui/button";
import {
  adjacentDistinctChapter,
  isChapterRead,
  readerProgressValue,
} from "@/lib/reader/chapter-progress";
import type { ReaderChapter, ReadingMode } from "@/lib/reader/types";
import { readingModeLabel } from "@/lib/reader/types";
import {
  mergeSavedView,
  readStoredView,
  resolveChapterRestore,
  snapshotChapterView,
  tickRestore,
  viewStorageKey,
  writeStoredView,
  type ChapterViewState,
} from "@/lib/reader/view-restore";
import {
  findChapterIndex,
} from "@/lib/reader/source-id";
import { cn } from "@/lib/utils";

type PagePayload = {
  index: number;
  url: string;
  render?: "pdf";
};

const MODE_STORAGE = "book-walker:reading-mode:";
const SAVER_STORAGE = "book-walker:data-saver";
const PAGES_TIMEOUT_MS = 30_000;

const pagesCache = new Map<string, PagePayload[]>();
const viewStateCache = new Map<string, ChapterViewState>();
const imagePrefetch = new Map<string, HTMLImageElement>();
let cacheBookId: string | null = null;
let pendingChapterNav: {
  bookId: string;
  chapterId: string;
  preferEnd: boolean;
} | null = null;

function pagesCacheKey(chapterId: string, dataSaver: boolean) {
  return `${chapterId}:${dataSaver ? "1" : "0"}`;
}

function persistView(
  key: string,
  state: ChapterViewState,
  unloading = false,
) {
  const next = mergeSavedView(viewStateCache.get(key) ?? readView(key), state, unloading);
  viewStateCache.set(key, next);
  try {
    writeStoredView(window.localStorage, key, next);
  } catch {
    /* ignore */
  }
}

function readView(key: string): ChapterViewState | undefined {
  const cached = viewStateCache.get(key);
  if (cached) return cached;
  try {
    const stored = readStoredView(window.localStorage, key);
    if (stored) viewStateCache.set(key, stored);
    return stored;
  } catch {
    return undefined;
  }
}

function resetCachesForBook(bookId: string) {
  if (cacheBookId === bookId) return;
  pagesCache.clear();
  viewStateCache.clear();
  imagePrefetch.clear();
  cacheBookId = bookId;
}

function prunePagesCache(keepKeys: Iterable<string>) {
  const keep = new Set(keepKeys);
  for (const key of pagesCache.keys()) {
    if (!keep.has(key)) pagesCache.delete(key);
  }
}

function pruneImages(keepUrls: Iterable<string>) {
  const keep = new Set(keepUrls);
  for (const url of imagePrefetch.keys()) {
    if (!keep.has(url)) imagePrefetch.delete(url);
  }
}

function prefetchImage(
  url: string | undefined,
  render?: "pdf",
  pageIndex?: number,
  fillWidth = false,
) {
  if (!url) return;
  if (render === "pdf" || url.includes("/api/reader/pdf?")) {
    prefetchPdfPage(url, pageIndex ?? 0, fillWidth);
    return;
  }
  if (imagePrefetch.has(url)) return;
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  imagePrefetch.set(url, img);
}

function nextDistinctIndex(
  pages: PagePayload[],
  from: number,
  direction: 1 | -1,
) {
  const currentUrl = pages[from]?.url;
  let index = from + direction;
  while (
    index >= 0 &&
    index < pages.length &&
    pages[index]?.url === currentUrl
  ) {
    index += direction;
  }
  return index;
}

function initialPageState(
  loadKey: string,
  viewKey: string,
  chapterId: string,
  bookId: string,
  fallbackPageIndex?: number,
) {
  const cached = pagesCache.get(loadKey);
  const saved = readView(viewKey);
  const pending =
    pendingChapterNav?.bookId === bookId &&
    pendingChapterNav.chapterId === chapterId
      ? pendingChapterNav
      : null;
  const restore = resolveChapterRestore({
    saved,
    preferEnd: pending?.preferEnd ?? false,
    pageCount: cached?.length ?? 0,
    fallbackPageIndex,
  });
  return {
    key: loadKey,
    pages: cached ?? [],
    pageIndex: restore.pageIndex,
    loading: !cached,
    error:
      cached && cached.length === 0
        ? "No pages were found for this chapter."
        : null,
  };
}

const MODE_ICONS: Record<ReadingMode, typeof PanelLeft> = {
  rtl: PanelLeft,
  ltr: PanelRight,
  webtoon: GalleryVertical,
};

const MODES: ReadingMode[] = ["rtl", "ltr", "webtoon"];

function subscribeStorage(key: string, onChange: () => void) {
  const handler = () => onChange();
  window.addEventListener("storage", handler);
  window.addEventListener(key, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(key, handler);
  };
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
    window.dispatchEvent(new Event(key));
  } catch {
    /* ignore */
  }
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function chapterIdFromPath(): string | null {
  const match = window.location.pathname.match(/^\/read\/[^/]+\/(.+)$/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function MangaReader({
  bookId,
  bookTitle,
  chapters,
  chapterId: initialChapterId,
  currentPage,
  suggestedMode,
  progressMode = "chapter",
}: {
  bookId: string;
  bookTitle: string;
  chapters: ReaderChapter[];
  chapterId: string;
  currentPage: number;
  suggestedMode: ReadingMode;
  progressMode?: "chapter" | "page";
}) {
  const router = useRouter();
  const [chapterId, setChapterId] = useState(initialChapterId);
  useEffect(() => {
    setChapterId(initialChapterId);
  }, [initialChapterId]);
  useEffect(() => {
    const onPop = () => {
      const fromPath = chapterIdFromPath();
      if (fromPath) setChapterId(fromPath);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const chapterIndex = findChapterIndex(chapters, chapterId);
  const chapter = chapters[chapterIndex];
  const resolvedChapterId = chapter?.id ?? chapterId;
  const prevChapter = adjacentDistinctChapter(chapters, chapterIndex, -1);
  const nextChapter = adjacentDistinctChapter(chapters, chapterIndex, 1);

  const modeKey = MODE_STORAGE + bookId;
  const mode = useSyncExternalStore(
    (onChange) => subscribeStorage(modeKey, onChange),
    () => {
      const stored = readStorage(modeKey);
      return stored === "rtl" || stored === "ltr" || stored === "webtoon"
        ? stored
        : suggestedMode;
    },
    () => suggestedMode,
  );
  const dataSaver = useSyncExternalStore(
    (onChange) => subscribeStorage(SAVER_STORAGE, onChange),
    () => readStorage(SAVER_STORAGE) === "1",
    () => false,
  );

  const [chaptersRead, setChaptersRead] = useState(currentPage);
  const [menuOpen, setMenuOpen] = useState(true);
  const [chapterListOpen, setChapterListOpen] = useState(false);
  const [pagedFooterOpen, setPagedFooterOpen] = useState(false);
  resetCachesForBook(bookId);
  const loadKey = pagesCacheKey(resolvedChapterId, dataSaver);
  const viewKey = viewStorageKey(bookId, resolvedChapterId, dataSaver);
  const progressFallback =
    progressMode === "page" && currentPage > 0 ? currentPage - 1 : undefined;
  const [pageState, setPageState] = useState(() =>
    initialPageState(loadKey, viewKey, resolvedChapterId, bookId, progressFallback),
  );
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const ignoreClick = useRef(false);
  const completedRef = useRef(false);
  const restoreSettledRef = useRef(false);
  const lastMouse = useRef<{ x: number; y: number } | null>(null);

  if (pageState.key !== loadKey) {
    restoreSettledRef.current = false;
    setPageState(initialPageState(loadKey, viewKey, resolvedChapterId, bookId, progressFallback));
    if (chapterListOpen) setChapterListOpen(false);
  }

  const pages = pageState.pages;
  const pageIndex = pageState.pageIndex;
  const loading = pageState.loading;
  const error = pageState.error;
  const setPageIndex = (value: number | ((current: number) => number)) => {
    setPageState((current) => ({
      ...current,
      pageIndex:
        typeof value === "function" ? value(current.pageIndex) : value,
    }));
  };

  const saveChapterView = useCallback(
    (unloading = false) => {
      persistView(
        viewKey,
        snapshotChapterView({
          pageIndex,
          scrollY: window.scrollY,
        }),
        unloading,
      );
    },
    [viewKey, pageIndex],
  );

  const savedView = readView(viewKey);
  const restoreToEnd =
    !savedView &&
    pendingChapterNav?.bookId === bookId &&
    pendingChapterNav.chapterId === resolvedChapterId &&
    pendingChapterNav.preferEnd;

  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("reader-active");
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      html.classList.remove("reader-active");
      window.history.scrollRestoration = previous;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    let frame = 0;
    const onScroll = () => {
      if (!restoreSettledRef.current) return;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        saveChapterView();
      });
    };
    const onHide = () => saveChapterView(true);
    const onVis = () => {
      if (document.visibilityState === "hidden") saveChapterView(true);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      saveChapterView(true);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [loading, saveChapterView]);

  useEffect(() => {
    if (loading || error) return;
    restoreSettledRef.current = true;
    saveChapterView();
  }, [loading, error, pageIndex, saveChapterView]);

  useEffect(() => {
    if (!pageState.loading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset timer when loading ends
      setElapsedMs(0);
      return;
    }
    const started = Date.now();
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - started);
    }, 250);
    return () => window.clearInterval(id);
  }, [pageState.loading, loadKey, loadAttempt]);

  const applyLoadedPages = useCallback(
    (loaded: PagePayload[]) => {
      const key = pagesCacheKey(resolvedChapterId, dataSaver);
      pagesCache.set(key, loaded);
      const saved = readView(viewStorageKey(bookId, resolvedChapterId, dataSaver));
      const pending =
        pendingChapterNav?.bookId === bookId &&
        pendingChapterNav.chapterId === resolvedChapterId
          ? pendingChapterNav
          : null;
      if (pending) pendingChapterNav = null;
      const restore = resolveChapterRestore({
        saved,
        preferEnd: pending?.preferEnd ?? false,
        pageCount: loaded.length,
        fallbackPageIndex:
          progressMode === "page" && currentPage > 0
            ? currentPage - 1
            : undefined,
      });
      setPageState((current) =>
        current.key === key
          ? {
              ...current,
              pages: loaded,
              pageIndex: restore.pageIndex,
              loading: false,
              error:
                loaded.length === 0
                  ? "No pages were found for this chapter."
                  : null,
            }
          : current,
      );
    },
    [bookId, resolvedChapterId, dataSaver, currentPage, progressMode],
  );

  useEffect(() => {
    let cancelled = false;
    let timedOut = false;
    completedRef.current = false;
    const key = pagesCacheKey(resolvedChapterId, dataSaver);
    const cached = pagesCache.get(key);
    if (cached) {
      return;
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, PAGES_TIMEOUT_MS);
    const params = dataSaver ? "?dataSaver=1" : "";
    fetch(`/api/books/${bookId}/chapters/${encodeURIComponent(resolvedChapterId)}/pages${params}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = (await res.json()) as {
          pages?: PagePayload[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(json.error ?? "Failed to load pages");
        }
        if (!cancelled) {
          applyLoadedPages(json.pages ?? []);
        }
      })
      .catch((err: unknown) => {
        if (cancelled && !timedOut) return;
        setPageState((current) =>
          current.key === key
            ? {
                ...current,
                loading: false,
                error: timedOut
                  ? "Timed out while loading pages. The source may be down or blocking the request."
                  : err instanceof Error
                    ? err.message
                    : "Failed to load pages",
              }
            : current,
        );
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [bookId, resolvedChapterId, dataSaver, loadAttempt, applyLoadedPages]);

  const persistMode = (next: ReadingMode) => {
    writeStorage(modeKey, next);
  };

  const persistSaver = (next: boolean) => {
    writeStorage(SAVER_STORAGE, next ? "1" : "0");
  };

  const reportProgress = useCallback(
    (completedChapter: boolean, pageOverride?: number) => {
      if (chapterIndex < 0) return;
      const chapter = chapters[chapterIndex];
      if (!chapter) return;
      const pageBased = progressMode === "page";
      const pageNumber = pageOverride ?? pageIndex + 1;
      const progressPage = pageBased
        ? Math.max(1, completedChapter ? Math.max(pageNumber, pages.length) : pageNumber)
        : readerProgressValue(chapter, chapterIndex);
      if (completedChapter) {
        setChaptersRead((read) => Math.max(read, progressPage));
      }
      // Route handler, not a Server Action: progress must not re-render the
      // reader page (that shows Next.js “Rendering” and re-fetches chapters).
      void fetch("/api/reader/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId,
          chapterIndex: pageBased ? Math.max(1, pageNumber) : chapterIndex + 1,
          chapterCount: pageBased ? Math.max(pages.length, 1) : chapters.length,
          completedChapter,
          progressPage,
          pageBased,
        }),
      });
    },
    [bookId, chapterIndex, chapters, pageIndex, pages.length, progressMode],
  );

  useEffect(() => {
    if (loading || error || pages.length === 0) return;
    if (progressMode === "page") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- progress ping on chapter load
    reportProgress(false);
    // Once per chapter load; reportProgress identity must not retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chapterId is the load key
  }, [loading, error, pages.length, resolvedChapterId]);

  useEffect(() => {
    if (progressMode !== "page" || loading || error || pages.length === 0) {
      return;
    }
    const completed = pageIndex >= pages.length - 1;
    const timer = window.setTimeout(() => {
      reportProgress(completed, pageIndex + 1);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [progressMode, loading, error, pages.length, pageIndex, reportProgress]);

  useEffect(() => {
    if (loading || error || pages.length === 0) return;
    const keepUrls: string[] = [];
    for (
      let i = Math.max(0, pageIndex - 1);
      i <= Math.min(pages.length - 1, pageIndex + 2);
      i += 1
    ) {
      const url = pages[i]?.url;
      if (url) {
        keepUrls.push(url);
        prefetchImage(
          pages[i]?.url,
          pages[i]?.render,
          pages[i]?.index,
          mode === "webtoon",
        );
      }
    }
    const nextChapterPages = nextChapter
      ? pagesCache.get(pagesCacheKey(nextChapter.id, dataSaver))
      : undefined;
    if (nextChapterPages?.[0]?.url) {
      keepUrls.push(nextChapterPages[0].url);
      prefetchImage(
        nextChapterPages[0].url,
        nextChapterPages[0].render,
        nextChapterPages[0].index,
      );
    }
    pruneImages(keepUrls);
  }, [loading, error, pages, pageIndex, nextChapter, dataSaver, mode]);

  useEffect(() => {
    if (loading || error || pages.length === 0) return;
    const keepKeys = [
      loadKey,
      prevChapter ? pagesCacheKey(prevChapter.id, dataSaver) : null,
      nextChapter ? pagesCacheKey(nextChapter.id, dataSaver) : null,
    ].filter((key): key is string => Boolean(key));
    prunePagesCache(keepKeys);
    if (!nextChapter) return;

    const nextKey = pagesCacheKey(nextChapter.id, dataSaver);
    if (pagesCache.has(nextKey)) return;

    const controller = new AbortController();
    const params = dataSaver ? "?dataSaver=1" : "";
    fetch(
      `/api/books/${bookId}/chapters/${encodeURIComponent(nextChapter.id)}/pages${params}`,
      { signal: controller.signal },
    )
      .then(async (res) => {
        if (!res.ok) return;
        const json = (await res.json()) as { pages?: PagePayload[] };
        const nextPages = json.pages ?? [];
        pagesCache.set(nextKey, nextPages);
        prefetchImage(nextPages[0]?.url, nextPages[0]?.render, nextPages[0]?.index);
        prunePagesCache(keepKeys);
      })
      .catch(() => {
        /* prefetch is best-effort */
      });

    return () => controller.abort();
  }, [
    loading,
    error,
    pages.length,
    loadKey,
    prevChapter,
    nextChapter,
    dataSaver,
    bookId,
  ]);

  const goToChapter = useCallback(
    (id: string | null | undefined, preferEnd = false) => {
      if (!id || id === resolvedChapterId) return;
      saveChapterView();
      pendingChapterNav = { bookId, chapterId: id, preferEnd };
      setChapterId(id);
      const href = `/read/${bookId}/${encodeURIComponent(id)}`;
      window.history.pushState({ chapterId: id }, "", href);
    },
    [bookId, resolvedChapterId, saveChapterView],
  );

  const markCompleteAndMaybeAdvance = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    reportProgress(true);
  }, [reportProgress]);

  const atLastPage = pages.length > 0 && pageIndex >= pages.length - 1;

  const goNextPage = useCallback(() => {
    if (pageIndex < pages.length - 1) {
      const next = nextDistinctIndex(pages, pageIndex, 1);
      if (next < pages.length) {
        setPageIndex(next);
        return;
      }
    }
    markCompleteAndMaybeAdvance();
    if (nextChapter) goToChapter(nextChapter.id);
  }, [
    pageIndex,
    pages,
    nextChapter,
    goToChapter,
    markCompleteAndMaybeAdvance,
  ]);

  const goPrevPage = useCallback(() => {
    if (pageIndex > 0) {
      const prev = nextDistinctIndex(pages, pageIndex, -1);
      if (prev >= 0) {
        setPageIndex(prev);
        return;
      }
    }
    if (prevChapter) goToChapter(prevChapter.id, true);
  }, [pageIndex, pages, prevChapter, goToChapter]);

  useEffect(() => {
    if (atLastPage && pages.length > 0) {
      markCompleteAndMaybeAdvance();
    }
  }, [atLastPage, pages.length, markCompleteAndMaybeAdvance]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (chapterListOpen) {
          setChapterListOpen(false);
          return;
        }
        saveChapterView();
        router.push(`/books/${bookId}`);
        return;
      }
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      setPagedFooterOpen(false);
      const forward = event.key === "ArrowRight";
      if (mode !== "webtoon") {
        if (mode === "rtl") {
          if (forward) goPrevPage();
          else goNextPage();
        } else if (forward) {
          goNextPage();
        } else {
          goPrevPage();
        }
        return;
      }
      if (forward) {
        markCompleteAndMaybeAdvance();
        goToChapter(nextChapter?.id);
      } else {
        goToChapter(prevChapter?.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    router,
    bookId,
    chapterListOpen,
    saveChapterView,
    nextChapter,
    prevChapter,
    goToChapter,
    goNextPage,
    goPrevPage,
    mode,
    markCompleteAndMaybeAdvance,
  ]);

  useEffect(() => {
    if (mode === "webtoon") return;
    const onMove = (event: MouseEvent) => {
      const last = lastMouse.current;
      lastMouse.current = { x: event.clientX, y: event.clientY };
      if (!last || (last.x === event.clientX && last.y === event.clientY)) {
        return;
      }
      setPagedFooterOpen(true);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [mode]);

  const onTap = (clientX: number, width: number) => {
    const ratio = clientX / width;
    if (ratio > 0.33 && ratio < 0.67) {
      const next = !menuOpen;
      setMenuOpen(next);
      setPagedFooterOpen(next);
      return;
    }
    if (mode === "webtoon") {
      setMenuOpen((open) => !open);
      return;
    }
    const left = ratio <= 0.33;
    if (mode === "rtl") {
      if (left) goNextPage();
      else goPrevPage();
    } else if (left) {
      goPrevPage();
    } else {
      goNextPage();
    }
  };

  const currentImage = pages[pageIndex];
  const ModeIcon = MODE_ICONS[mode];

  const chapterOptions = useMemo(
    () => [...chapters].reverse(),
    [chapters],
  );

  if (!chapter) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-black px-4 text-center">
        <p className="text-zinc-300">Chapter not found.</p>
        <Link href={`/books/${bookId}`} className="text-sm text-violet-400">
          Back to title
        </Link>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh bg-black text-white">
      <div
        className="min-h-dvh select-none"
        onClick={(event) => {
          if (chapterListOpen) return;
          if (ignoreClick.current) {
            ignoreClick.current = false;
            return;
          }
          onTap(event.clientX, event.currentTarget.clientWidth);
        }}
        onTouchStart={(event) => {
          const touch = event.changedTouches[0];
          touchStart.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={(event) => {
          if (mode === "webtoon" || !touchStart.current) return;
          const touch = event.changedTouches[0];
          const dx = touch.clientX - touchStart.current.x;
          const dy = touch.clientY - touchStart.current.y;
          touchStart.current = null;
          if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
          ignoreClick.current = true;
          if (mode === "rtl") {
            if (dx > 0) goNextPage();
            else goPrevPage();
          } else if (dx < 0) {
            goNextPage();
          } else {
            goPrevPage();
          }
        }}
      >
        {loading && (
          <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center text-zinc-400">
            <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
            <p className="text-sm text-zinc-200">Loading pages…</p>
            <p className="max-w-sm text-xs text-zinc-500">
              {elapsedMs < 4_000
                ? "Fetching chapter images from the source."
                : elapsedMs < 15_000
                  ? `Still working… ${Math.floor(elapsedMs / 1000)}s`
                  : `Taking longer than usual (${Math.floor(elapsedMs / 1000)}s). The source may be slow or stuck.`}
            </p>
          </div>
        )}
        {error && (
          <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
            <p className="text-red-300">{error}</p>
            <button
              type="button"
              className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500"
              onClick={(event) => {
                event.stopPropagation();
                setPageState((current) => ({
                  ...current,
                  pages: [],
                  loading: true,
                  error: null,
                }));
                pagesCache.delete(loadKey);
                setLoadAttempt((attempt) => attempt + 1);
              }}
            >
              Retry
            </button>
            <Link href={`/books/${bookId}`} className="text-sm text-violet-400">
              Back to title
            </Link>
          </div>
        )}
        {!loading && !error && mode === "webtoon" && (
          <WebtoonViewer
            pages={pages}
            restoreScroll={
              restoreToEnd
                ? "end"
                : (savedView?.webtoonScrollY ?? 0)
            }
            onRestoreSettled={() => {
              restoreSettledRef.current = true;
            }}
            onLastPage={markCompleteAndMaybeAdvance}
            onNextChapter={
              nextChapter ? () => goToChapter(nextChapter.id) : undefined
            }
          />
        )}
        {!loading && !error && mode !== "webtoon" && currentImage && (
          currentImage.render === "pdf" ? (
            <PdfPageView
              url={currentImage.url}
              pageIndex={currentImage.index}
            />
          ) : (
            <PagedImage
              url={currentImage.url}
              alt={`Page ${pageIndex + 1}`}
            />
          )
        )}
      </div>

      {menuOpen && (
          <header className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/80 to-transparent">
            <div className="pointer-events-auto flex items-center gap-2 px-3 py-3">
              <Link
                href={`/books/${bookId}`}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-white/10"
                aria-label="Back"
                onClick={(event) => event.stopPropagation()}
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{bookTitle}</p>
                <p className="truncate text-xs text-zinc-400">{chapter.name}</p>
              </div>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-white/10"
                aria-label="Chapters"
                onClick={(event) => {
                  event.stopPropagation();
                  setChapterListOpen((open) => !open);
                }}
              >
                <List className="h-5 w-5" />
              </button>
            </div>
          </header>
      )}

      {(mode === "webtoon" ? menuOpen : pagedFooterOpen) && (
          <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/85 to-transparent">
            <div
              className="pointer-events-auto space-y-3 px-4 py-4"
              onClick={(event) => event.stopPropagation()}
            >
              {mode !== "webtoon" && pages.length > 0 && (
                <div className="flex items-center gap-3 text-xs text-zinc-300">
                  <span className="w-12 tabular-nums">
                    {pageIndex + 1}/{pages.length}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(pages.length - 1, 0)}
                    value={pageIndex}
                    onChange={(event) =>
                      setPageIndex(Number(event.target.value))
                    }
                    className="w-full accent-violet-500"
                  />
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!prevChapter}
                  onClick={() => goToChapter(prevChapter?.id)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </Button>
                <div className="flex items-center gap-1">
                  {MODES.map((value) => {
                    const Icon = MODE_ICONS[value];
                    return (
                      <button
                        key={value}
                        type="button"
                        title={readingModeLabel(value)}
                        onClick={() => persistMode(value)}
                        className={cn(
                          "inline-flex h-9 w-9 items-center justify-center rounded-md",
                          mode === value
                            ? "bg-violet-600 text-white"
                            : "text-zinc-300 hover:bg-white/10",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    );
                  })}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!nextChapter}
                  onClick={() => {
                    markCompleteAndMaybeAdvance();
                    goToChapter(nextChapter?.id);
                  }}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="inline-flex items-center gap-1.5">
                  <ModeIcon className="h-3.5 w-3.5" />
                  {readingModeLabel(mode)}
                </span>
                <button
                  type="button"
                  className="hover:text-zinc-200"
                  onClick={() => persistSaver(!dataSaver)}
                >
                  {dataSaver ? "Data saver on" : "Data saver off"}
                </button>
              </div>
            </div>
          </footer>
      )}

      {chapterListOpen && (
        <div
          className="absolute inset-0 z-30 flex justify-end bg-black/50"
          onClick={() => setChapterListOpen(false)}
        >
          <aside
            className="flex h-full w-full max-w-sm flex-col border-l border-zinc-800 bg-zinc-950"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <p className="font-medium">Chapters</p>
              <BookOpen className="h-4 w-4 text-zinc-500" />
            </div>
            <ol className="flex-1 overflow-y-auto">
              {chapterOptions.map((item) => {
                const sourceIndex = chapters.findIndex((c) => c.id === item.id);
                const read = isChapterRead(item, chaptersRead, sourceIndex);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => goToChapter(item.id)}
                      className={cn(
                        "block w-full px-4 py-3 text-left text-sm hover:bg-zinc-900",
                        item.id === resolvedChapterId
                          ? "bg-violet-950/40 text-violet-100"
                          : read
                            ? "text-zinc-500"
                            : "text-zinc-200",
                      )}
                    >
                      {item.name}
                    </button>
                  </li>
                );
              })}
            </ol>
          </aside>
        </div>
      )}
    </div>
  );
}

function readerImageSrc(url: string, attempt: number) {
  if (attempt <= 0) return url;
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}retry=${attempt}`;
}

function ReaderPageImage({
  url,
  alt,
  className,
  imgRef,
}: {
  url: string;
  alt: string;
  className?: string;
  imgRef?: (node: HTMLImageElement | null) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const src = readerImageSrc(url, attempt);

  useEffect(() => {
    setAttempt(0);
  }, [url]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      className={className}
      draggable={false}
      onError={() => {
        setAttempt((current) => (current < 2 ? current + 1 : current));
      }}
    />
  );
}

function PagedImage({ url, alt }: { url: string; alt: string }) {
  const [shown, setShown] = useState(url);

  useEffect(() => {
    if (url === shown) return;
    const image = new Image();
    const reveal = () => setShown(url);
    image.addEventListener("load", reveal);
    image.src = url;
    if (image.complete && image.naturalHeight > 0) reveal();
    return () => image.removeEventListener("load", reveal);
  }, [url, shown]);

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <ReaderPageImage
        url={shown}
        alt={alt}
        className="max-h-dvh max-w-full object-contain"
      />
    </div>
  );
}

function WebtoonViewer({
  pages,
  restoreScroll,
  onLastPage,
  onNextChapter,
  onRestoreSettled,
}: {
  pages: PagePayload[];
  restoreScroll: number | "end";
  onLastPage: () => void;
  onNextChapter?: () => void;
  onRestoreSettled?: () => void;
}) {
  const lastRef = useRef<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = lastRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLastPage();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [pages, onLastPage]);

  useEffect(() => {
    if (restoreScroll === 0) {
      onRestoreSettled?.();
      return;
    }
    let cancelled = false;
    let userMoved = false;

    const metrics = () => ({
      scrollTop: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: window.innerHeight,
    });

    const imagesProgress = () => {
      const images = rootRef.current
        ? [...rootRef.current.querySelectorAll("img")]
        : [];
      return {
        ready: images.filter((img) => img.complete && img.naturalHeight > 0)
          .length,
        total: images.length,
      };
    };

    const apply = () => {
      if (cancelled || userMoved) return true;
      const result = tickRestore(restoreScroll, metrics(), imagesProgress());
      window.scrollTo(0, result.scrollTop);
      if (result.done) onRestoreSettled?.();
      return result.done;
    };

    const stopOnUser = () => {
      userMoved = true;
      onRestoreSettled?.();
    };

    apply();
    const images = rootRef.current
      ? [...rootRef.current.querySelectorAll("img, canvas")]
      : [];
    for (const img of images) img.addEventListener("load", apply);
    const observer = new ResizeObserver(() => {
      apply();
    });
    if (rootRef.current) observer.observe(rootRef.current);

    const tick = window.setInterval(() => {
      if (apply()) window.clearInterval(tick);
    }, 50);

    window.addEventListener("wheel", stopOnUser, { passive: true });
    window.addEventListener("touchmove", stopOnUser, { passive: true });

    return () => {
      cancelled = true;
      window.clearInterval(tick);
      observer.disconnect();
      for (const img of images) img.removeEventListener("load", apply);
      window.removeEventListener("wheel", stopOnUser);
      window.removeEventListener("touchmove", stopOnUser);
    };
  }, [pages, restoreScroll, onRestoreSettled]);

  return (
    <div
      ref={rootRef}
      className="reader-webtoon mx-auto flex min-h-dvh max-w-3xl flex-col"
    >
      {pages.map((page, index) =>
        page.render === "pdf" ? (
          <div
            key={`${page.index}-${page.url}`}
            ref={
              index === pages.length - 1
                ? (node) => {
                    lastRef.current = node;
                  }
                : undefined
            }
            className="w-full bg-white"
          >
            <PdfPageView
              url={page.url}
              pageIndex={page.index}
              fillWidth
            />
          </div>
        ) : (
          <ReaderPageImage
            key={`${page.index}-${page.url}`}
            imgRef={
              index === pages.length - 1
                ? (node) => {
                    lastRef.current = node;
                  }
                : undefined
            }
            url={page.url}
            alt={`Page ${index + 1}`}
            className="w-full"
          />
        ),
      )}
      {onNextChapter && (
        <div className="flex justify-center py-10">
          <button
            type="button"
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
            onClick={(event) => {
              event.stopPropagation();
              onLastPage();
              onNextChapter();
            }}
          >
            Next chapter
          </button>
        </div>
      )}
    </div>
  );
}
