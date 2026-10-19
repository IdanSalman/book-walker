let freshDepth = 0;

/** Run source fetches without the Next.js data cache (user-triggered refresh). */
export async function withFreshReaderFetch<T>(fn: () => Promise<T>): Promise<T> {
  freshDepth += 1;
  try {
    return await fn();
  } finally {
    freshDepth -= 1;
  }
}

export function isFreshReaderFetch(): boolean {
  return freshDepth > 0;
}

export function readerFetchRevalidate(
  requested: number | false | undefined,
  fallback: number | false = 300,
): number | false {
  if (freshDepth > 0) return false;
  return requested ?? fallback;
}

/** Vercel sets this for both production and preview deployments. */
export function isVercelDeployment(): boolean {
  return Boolean(process.env.VERCEL);
}

const SEARCH_QUERY_PARAMS = [
  "search",
  "q",
  "keyword",
  "query",
  "text",
  "title",
  "s",
];

/**
 * True when the upstream URL is a title search rather than a browse listing.
 * Browse URLs stay cacheable; search URLs must not, or a cached document can
 * keep showing the unfiltered list.
 */
export function isSourceSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (/\/search\/story\//i.test(parsed.pathname)) return true;
    return SEARCH_QUERY_PARAMS.some((key) =>
      Boolean(parsed.searchParams.get(key)?.trim()),
    );
  } catch {
    return false;
  }
}
