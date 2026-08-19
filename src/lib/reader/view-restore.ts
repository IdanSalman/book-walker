export type ChapterViewState = {
  pageIndex: number;
  pageScrolls: Record<number, number>;
  webtoonScrollY: number;
};

export type RestoreTarget = number | "end";

export type ScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

export type ViewStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export const VIEW_STORAGE_PREFIX = "book-walker:reader-view:";

export function viewStorageKey(
  bookId: string,
  chapterId: string,
  dataSaver: boolean,
) {
  return `${VIEW_STORAGE_PREFIX}${bookId}:${chapterId}:${dataSaver ? "1" : "0"}`;
}

export function parseView(raw: string | null): ChapterViewState | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as ChapterViewState;
    if (
      typeof parsed?.pageIndex !== "number" ||
      typeof parsed?.webtoonScrollY !== "number" ||
      typeof parsed?.pageScrolls !== "object" ||
      parsed.pageScrolls == null
    ) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export function readStoredView(store: ViewStore, key: string) {
  return parseView(store.getItem(key));
}

export function writeStoredView(
  store: ViewStore,
  key: string,
  state: ChapterViewState,
) {
  store.setItem(key, JSON.stringify(state));
}

export function snapshotChapterView(input: {
  pageIndex: number;
  pageScrolls?: Record<number, number>;
  scrollY: number;
}): ChapterViewState {
  return {
    pageIndex: input.pageIndex,
    pageScrolls: {
      ...(input.pageScrolls ?? {}),
      [input.pageIndex]: input.scrollY,
    },
    webtoonScrollY: input.scrollY,
  };
}

export function mergeSavedView(
  previous: ChapterViewState | undefined,
  next: ChapterViewState,
  unloading = false,
) {
  if (
    unloading &&
    previous &&
    next.webtoonScrollY === 0 &&
    previous.webtoonScrollY > 0 &&
    next.pageIndex === previous.pageIndex
  ) {
    return previous;
  }
  return next;
}

export function resolveChapterRestore(input: {
  saved?: ChapterViewState;
  preferEnd: boolean;
  pageCount: number;
  fallbackPageIndex?: number;
}): { pageIndex: number; scroll: RestoreTarget } {
  if (input.preferEnd && !input.saved && input.pageCount > 0) {
    return { pageIndex: input.pageCount - 1, scroll: "end" };
  }

  const fallback =
    typeof input.fallbackPageIndex === "number" &&
    Number.isFinite(input.fallbackPageIndex)
      ? Math.floor(input.fallbackPageIndex)
      : undefined;

  const clamp = (index: number) => {
    if (input.pageCount <= 0) return Math.max(0, index);
    return Math.min(Math.max(0, index), input.pageCount - 1);
  };

  if (input.saved) {
    const savedIndex = input.saved.pageIndex;
    const useFallback =
      fallback != null && fallback > savedIndex && savedIndex <= 0;
    const pageIndex = clamp(useFallback ? fallback : savedIndex);
    const fromPage = input.saved.pageScrolls[pageIndex];
    const scroll =
      input.saved.webtoonScrollY > 0
        ? input.saved.webtoonScrollY
        : (fromPage ?? 0);
    return { pageIndex, scroll };
  }
  if (fallback != null && input.pageCount > 0) {
    return { pageIndex: clamp(fallback), scroll: 0 };
  }
  return { pageIndex: 0, scroll: 0 };
}

export function maxScrollTop(
  metrics: Pick<ScrollMetrics, "scrollHeight" | "clientHeight">,
) {
  return Math.max(0, metrics.scrollHeight - metrics.clientHeight);
}

export function clampedScrollTop(
  target: RestoreTarget,
  metrics: Pick<ScrollMetrics, "scrollHeight" | "clientHeight">,
) {
  const max = maxScrollTop(metrics);
  if (target === "end") return max;
  return Math.min(Math.max(0, target), max);
}

export function restoreIsComplete(
  target: RestoreTarget,
  metrics: ScrollMetrics,
  images: { ready: number; total: number },
) {
  if (images.total > 0 && images.ready < images.total) return false;
  const max = maxScrollTop(metrics);
  if (target === "end" || (typeof target === "number" && target > max)) {
    return metrics.scrollTop >= max - 2;
  }
  return Math.abs(metrics.scrollTop - target) <= 2;
}

export function tickRestore(
  target: RestoreTarget,
  metrics: ScrollMetrics,
  images: { ready: number; total: number },
) {
  const scrollTop = clampedScrollTop(target, metrics);
  const next: ScrollMetrics = { ...metrics, scrollTop };
  return {
    scrollTop,
    done: restoreIsComplete(target, next, images),
  };
}
