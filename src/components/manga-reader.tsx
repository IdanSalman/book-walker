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
  PanelLeft,
  PanelRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { updateReaderProgress } from "@/lib/actions/reader";
import type { ReaderChapter, ReadingMode } from "@/lib/reader/types";
import { readingModeLabel } from "@/lib/reader/types";
import { cn } from "@/lib/utils";

type PagePayload = {
  index: number;
  url: string;
};

const MODE_STORAGE = "book-walker:reading-mode:";
const SAVER_STORAGE = "book-walker:data-saver";

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

export function MangaReader({
  bookId,
  bookTitle,
  chapters,
  chapterId,
  currentPage,
  suggestedMode,
}: {
  bookId: string;
  bookTitle: string;
  chapters: ReaderChapter[];
  chapterId: string;
  currentPage: number;
  suggestedMode: ReadingMode;
}) {
  const router = useRouter();
  const chapterIndex = chapters.findIndex((chapter) => chapter.id === chapterId);
  const chapter = chapters[chapterIndex];
  const prevChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : null;
  const nextChapter =
    chapterIndex >= 0 && chapterIndex < chapters.length - 1
      ? chapters[chapterIndex + 1]
      : null;

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

  const [menuOpen, setMenuOpen] = useState(true);
  const [chapterListOpen, setChapterListOpen] = useState(false);
  const loadKey = `${chapterId}:${dataSaver ? "1" : "0"}`;
  const [pageState, setPageState] = useState<{
    key: string;
    pages: PagePayload[];
    pageIndex: number;
    loading: boolean;
    error: string | null;
  }>({
    key: loadKey,
    pages: [],
    pageIndex: 0,
    loading: true,
    error: null,
  });
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const ignoreClick = useRef(false);
  const completedRef = useRef(false);

  if (pageState.key !== loadKey) {
    setPageState({
      key: loadKey,
      pages: [],
      pageIndex: 0,
      loading: true,
      error: null,
    });
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

  useEffect(() => {
    let cancelled = false;
    completedRef.current = false;
    const params = dataSaver ? "?dataSaver=1" : "";
    fetch(`/api/books/${bookId}/chapters/${chapterId}/pages${params}`)
      .then(async (res) => {
        const json = (await res.json()) as {
          pages?: PagePayload[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(json.error ?? "Failed to load pages");
        }
        if (!cancelled) {
          setPageState((current) =>
            current.key === `${chapterId}:${dataSaver ? "1" : "0"}`
              ? {
                  ...current,
                  pages: json.pages ?? [],
                  loading: false,
                  error: null,
                }
              : current,
          );
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPageState((current) =>
            current.key === `${chapterId}:${dataSaver ? "1" : "0"}`
              ? {
                  ...current,
                  loading: false,
                  error:
                    err instanceof Error ? err.message : "Failed to load pages",
                }
              : current,
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bookId, chapterId, dataSaver]);

  const persistMode = (next: ReadingMode) => {
    writeStorage(modeKey, next);
  };

  const persistSaver = (next: boolean) => {
    writeStorage(SAVER_STORAGE, next ? "1" : "0");
  };

  const reportProgress = useCallback(
    (completedChapter: boolean) => {
      if (chapterIndex < 0) return;
      void updateReaderProgress({
        bookId,
        chapterIndex: chapterIndex + 1,
        chapterCount: chapters.length,
        completedChapter,
      });
    },
    [bookId, chapterIndex, chapters.length],
  );

  useEffect(() => {
    if (!loading && !error && pages.length > 0) {
      reportProgress(false);
    }
  }, [loading, error, pages.length, reportProgress]);

  const goToChapter = useCallback(
    (id: string | null | undefined) => {
      if (!id) return;
      router.push(`/read/${bookId}/${id}`);
    },
    [bookId, router],
  );

  const markCompleteAndMaybeAdvance = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    reportProgress(true);
  }, [reportProgress]);

  const atLastPage = pages.length > 0 && pageIndex >= pages.length - 1;

  const goNextPage = useCallback(() => {
    if (pageIndex < pages.length - 1) {
      setPageIndex((index) => index + 1);
      return;
    }
    markCompleteAndMaybeAdvance();
    if (nextChapter) goToChapter(nextChapter.id);
  }, [pageIndex, pages.length, nextChapter, goToChapter, markCompleteAndMaybeAdvance]);

  const goPrevPage = useCallback(() => {
    if (pageIndex > 0) {
      setPageIndex((index) => index - 1);
      return;
    }
    if (prevChapter) goToChapter(prevChapter.id);
  }, [pageIndex, prevChapter, goToChapter]);

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
        router.push(`/books/${bookId}`);
        return;
      }
      if (mode === "webtoon") return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (mode === "rtl") goPrevPage();
        else goNextPage();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (mode === "rtl") goNextPage();
        else goPrevPage();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, goNextPage, goPrevPage, router, bookId, chapterListOpen]);

  const onTap = (clientX: number, width: number) => {
    const ratio = clientX / width;
    if (ratio > 0.33 && ratio < 0.67) {
      setMenuOpen((open) => !open);
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
          <div className="flex min-h-dvh items-center justify-center text-sm text-zinc-400">
            Loading pages…
          </div>
        )}
        {error && (
          <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
            <p className="text-red-300">{error}</p>
            <Link href={`/books/${bookId}`} className="text-sm text-violet-400">
              Back to title
            </Link>
          </div>
        )}
        {!loading && !error && mode === "webtoon" && (
          <WebtoonViewer
            pages={pages}
            onLastPage={markCompleteAndMaybeAdvance}
            onNextChapter={
              nextChapter ? () => goToChapter(nextChapter.id) : undefined
            }
          />
        )}
        {!loading && !error && mode !== "webtoon" && currentImage && (
          <div className="flex min-h-dvh items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentImage.url}
              alt={`Page ${pageIndex + 1}`}
              className="max-h-dvh max-w-full object-contain"
              draggable={false}
            />
            {pages.slice(pageIndex + 1, pageIndex + 3).map((page) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={page.url}
                src={page.url}
                alt=""
                className="hidden"
              />
            ))}
          </div>
        )}
      </div>

      {menuOpen && (
        <>
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
        </>
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
                const read = currentPage > 0 && sourceIndex < currentPage;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => goToChapter(item.id)}
                      className={cn(
                        "block w-full px-4 py-3 text-left text-sm hover:bg-zinc-900",
                        item.id === chapterId
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

function WebtoonViewer({
  pages,
  onLastPage,
  onNextChapter,
}: {
  pages: PagePayload[];
  onLastPage: () => void;
  onNextChapter?: () => void;
}) {
  const lastRef = useRef<HTMLImageElement | null>(null);

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

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col">
      {pages.map((page, index) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${page.index}-${page.url}`}
          ref={index === pages.length - 1 ? lastRef : undefined}
          src={page.url}
          alt={`Page ${index + 1}`}
          className="w-full"
          draggable={false}
        />
      ))}
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
