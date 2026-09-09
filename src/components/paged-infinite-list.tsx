"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export const MAX_VISIBLE_PAGES = 2;

export type PagedFetchResult<T> = {
  items: T[];
  hasMore: boolean;
};

type LoadedPage<T> = {
  page: number;
  items: T[];
};

type PagedInfiniteListProps<T> = {
  initialPage: number;
  initialItems: T[];
  initialHasMore: boolean;
  fetchPage: (page: number) => Promise<PagedFetchResult<T>>;
  renderPage: (items: T[], page: number) => ReactNode;
  pageHref?: (page: number) => string;
};

function syncPageUrl(href: string) {
  const next = new URL(href, window.location.origin);
  if (
    window.location.pathname === next.pathname &&
    window.location.search === next.search
  ) {
    return;
  }
  window.history.replaceState(
    window.history.state,
    "",
    next.pathname + next.search,
  );
}

export function PagedInfiniteList<T>({
  initialPage,
  initialItems,
  initialHasMore,
  fetchPage,
  renderPage,
  pageHref,
}: PagedInfiniteListProps<T>) {
  const [pages, setPages] = useState<LoadedPage<T>[]>([
    { page: initialPage, items: initialItems },
  ]);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"up" | "down" | null>(null);

  const heightsRef = useRef(new Map<number, number>());
  const [topSpacer, setTopSpacer] = useState(0);
  const [bottomSpacer, setBottomSpacer] = useState(0);

  const loadingRef = useRef<"up" | "down" | null>(null);
  const pagesRef = useRef(pages);
  const knownEndRef = useRef<number | null>(initialHasMore ? null : initialPage);
  const scrollDirRef = useRef<"up" | "down" | null>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const anchorPageRef = useRef<number | null>(null);
  const anchorTopRef = useRef(0);

  pagesRef.current = pages;

  const firstPage = pages[0]?.page ?? initialPage;
  const lastPage = pages[pages.length - 1]?.page ?? initialPage;

  const measureSpacers = useCallback((windowPages: LoadedPage<T>[]) => {
    const lo = windowPages[0]?.page;
    const hi = windowPages[windowPages.length - 1]?.page;
    if (lo == null || hi == null) return;
    let top = 0;
    let bottom = 0;
    for (const [page, height] of heightsRef.current) {
      if (page < lo) top += height;
      if (page > hi) bottom += height;
    }
    setTopSpacer(top);
    setBottomSpacer(bottom);
  }, []);

  const applyWindow = useCallback(
    (nextPages: LoadedPage<T>[]) => {
      const sorted = [...nextPages].sort((a, b) => a.page - b.page);
      while (sorted.length > MAX_VISIBLE_PAGES) {
        if (loadingRef.current === "down") {
          sorted.shift();
        } else {
          sorted.pop();
        }
      }
      const hi = sorted[sorted.length - 1]?.page ?? initialPage;
      const end = knownEndRef.current;
      setPages(sorted);
      setHasMore(end == null || hi < end);
      measureSpacers(sorted);
    },
    [initialPage, measureSpacers],
  );

  const load = useCallback(
    async (direction: "up" | "down") => {
      if (loadingRef.current) return;
      const current = pagesRef.current;
      const lo = current[0]?.page ?? initialPage;
      const hi = current[current.length - 1]?.page ?? initialPage;
      const target = direction === "down" ? hi + 1 : lo - 1;
      if (target < 1) return;
      if (direction === "down" && knownEndRef.current != null && target > knownEndRef.current) {
        return;
      }
      if (current.some((chunk) => chunk.page === target)) return;

      loadingRef.current = direction;
      setLoading(direction);
      setError(null);

      try {
        const result = await fetchPage(target);
        if (direction === "down" && !result.hasMore) {
          knownEndRef.current = target;
        }
        if (direction === "up") {
          const currentFirst = pagesRef.current[0]?.page ?? lo;
          const node = pageRefs.current.get(currentFirst);
          anchorPageRef.current = currentFirst;
          anchorTopRef.current = node?.getBoundingClientRect().top ?? 0;
        }
        applyWindow([...pagesRef.current, { page: target, items: result.items }]);
      } catch {
        setError("Could not load more titles.");
      } finally {
        loadingRef.current = null;
        setLoading(null);
      }
    },
    [applyWindow, fetchPage, initialPage],
  );

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < lastY - 2) scrollDirRef.current = "up";
      else if (y > lastY + 2) scrollDirRef.current = "down";
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const observers: ResizeObserver[] = [];
    for (const [page, node] of pageRefs.current) {
      const observer = new ResizeObserver((entries) => {
        const height = entries[0]?.borderBoxSize?.[0]?.blockSize ?? node.offsetHeight;
        heightsRef.current.set(page, height);
        measureSpacers(pagesRef.current);
      });
      observer.observe(node);
      observers.push(observer);
    }
    return () => {
      for (const observer of observers) observer.disconnect();
    };
  }, [pages, measureSpacers]);

  useLayoutEffect(() => {
    const anchorPage = anchorPageRef.current;
    if (anchorPage == null) return;
    const node = pageRefs.current.get(anchorPage);
    anchorPageRef.current = null;
    if (!node) return;
    const delta = node.getBoundingClientRect().top - anchorTopRef.current;
    if (Math.abs(delta) > 1) {
      window.scrollBy(0, delta);
    }
  }, [pages]);

  useEffect(() => {
    const bottom = bottomSentinelRef.current;
    const top = topSentinelRef.current;
    if (!bottom || !top) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (entry.target === bottom) {
            void load("down");
          } else if (entry.target === top && scrollDirRef.current === "up") {
            void load("up");
          }
        }
      },
      { root: null, rootMargin: "0px", threshold: 0 },
    );

    observer.observe(bottom);
    observer.observe(top);
    return () => observer.disconnect();
  }, [load, firstPage, lastPage, hasMore]);

  useLayoutEffect(() => {
    if (!pageHref) return;
    syncPageUrl(pageHref(firstPage));
  }, [firstPage, pageHref]);

  return (
    <div>
      <div ref={topSentinelRef} className="h-px w-full" aria-hidden />
      {topSpacer > 0 && (
        <div style={{ height: topSpacer }} aria-hidden className="shrink-0" />
      )}

      <div className="space-y-4">
        {pages.map((chunk) => (
          <div
            key={chunk.page}
            ref={(node) => {
              if (node) pageRefs.current.set(chunk.page, node);
              else pageRefs.current.delete(chunk.page);
            }}
          >
            {renderPage(chunk.items, chunk.page)}
          </div>
        ))}
      </div>

      <div ref={bottomSentinelRef} className="h-px w-full" aria-hidden />
      {bottomSpacer > 0 && (
        <div style={{ height: bottomSpacer }} aria-hidden className="shrink-0" />
      )}

      {loading && (
        <p className="py-2 text-center text-sm text-zinc-500">Loading more…</p>
      )}
      {error && (
        <p className="py-2 text-center text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
