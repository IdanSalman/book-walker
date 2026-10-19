import { latestChapterNumber } from "@/lib/reader/chapter-progress";
import { latestMangaDexChapterNumber } from "@/lib/reader/mangadex-source";
import {
  engineMatchesName,
  engineMatchesUrl,
  type ReaderBookRef,
  type ReaderSourceEngine,
} from "@/lib/reader/source-engine";

const CAUGHT_UP_CONCURRENCY = 6;
const CAUGHT_UP_PER_HOST = 2;

export type CaughtUpBook = {
  id: string;
  title: string;
  totalPages: number;
  externalId: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
};

export type CaughtUpRefreshResult = {
  checked: number;
  withNewChapters: number;
  updatedBookIds: string[];
  errors: string[];
};

export type ChapterCountDeps = {
  latestMangaDexChapterNumber?: (sourceUrl: string) => Promise<number>;
  persistIncrease?: (book: CaughtUpBook, totalPages: number) => Promise<void>;
};

/**
 * The engine for this listing’s saved source.
 * A stored URL wins over the source name. The name is used only when no URL
 * is stored. A URL that matches no engine is not retried against other sources.
 */
export function matchStoredSource(
  engines: ReaderSourceEngine[],
  book: Pick<ReaderBookRef, "sourceUrl" | "sourceName">,
): ReaderSourceEngine | undefined {
  if (book.sourceUrl?.trim()) {
    return engines.find((engine) => engineMatchesUrl(engine, book.sourceUrl));
  }
  return engines.find((engine) => engineMatchesName(engine, book.sourceName));
}

export function caughtUpHostKey(
  book: Pick<CaughtUpBook, "sourceUrl" | "sourceName">,
): string {
  const url = book.sourceUrl?.trim();
  if (url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return "unknown";
    }
  }
  const name = book.sourceName?.trim();
  return name ? `name:${name.toLowerCase()}` : "unknown";
}

export async function chapterCountFromStoredSource(
  book: ReaderBookRef,
  engines: ReaderSourceEngine[],
  deps?: Pick<ChapterCountDeps, "latestMangaDexChapterNumber">,
): Promise<number> {
  const engine = matchStoredSource(engines, book);
  if (!engine) {
    throw new Error("No saved reading source for this title");
  }

  if (engine.key === "mangadex" && book.sourceUrl?.trim()) {
    const latest = deps?.latestMangaDexChapterNumber ?? latestMangaDexChapterNumber;
    return latest(book.sourceUrl);
  }

  const resolved = await engine.resolveManga(book);
  if (resolved.chapters.length === 0) {
    throw new Error(`${engine.name}: no readable chapters`);
  }
  return latestChapterNumber(resolved.chapters);
}

/**
 * Refetch latest chapter counts for fully-read manga, using each title’s
 * saved source only. Several titles run at once, with a per-host cap.
 */
export async function refreshCaughtUpChapterCounts(
  books: CaughtUpBook[],
  engines: ReaderSourceEngine[],
  deps?: ChapterCountDeps,
): Promise<CaughtUpRefreshResult> {
  let checked = 0;
  let withNewChapters = 0;
  const updatedBookIds: string[] = [];
  const errors: string[] = [];

  await runBounded(books, caughtUpHostKey, async (book) => {
    try {
      const totalPages = await chapterCountFromStoredSource(book, engines, deps);
      if (totalPages > book.totalPages) {
        await deps?.persistIncrease?.(book, totalPages);
        withNewChapters += 1;
        updatedBookIds.push(book.id);
      }
      checked += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Chapter check failed";
      errors.push(`${book.title}: ${message}`);
    }
  });

  return { checked, withNewChapters, updatedBookIds, errors };
}

async function runBounded<T>(
  items: T[],
  hostOf: (item: T) => string,
  run: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;

  const queue = [...items];
  const hostActive = new Map<string, number>();
  let active = 0;

  await new Promise<void>((resolve, reject) => {
    let finished = 0;
    let rejected = false;

    const launch = () => {
      if (rejected) return;

      while (active < CAUGHT_UP_CONCURRENCY && queue.length > 0) {
        const index = queue.findIndex(
          (item) => (hostActive.get(hostOf(item)) ?? 0) < CAUGHT_UP_PER_HOST,
        );
        if (index === -1) break;
        const item = queue.splice(index, 1)[0];
        if (!item) break;
        const host = hostOf(item);
        hostActive.set(host, (hostActive.get(host) ?? 0) + 1);
        active += 1;
        run(item).then(
          () => {
            active -= 1;
            hostActive.set(host, (hostActive.get(host) ?? 1) - 1);
            finished += 1;
            if (finished === items.length) resolve();
            else launch();
          },
          (error: unknown) => {
            rejected = true;
            reject(error);
          },
        );
      }
    };

    launch();
  });
}
