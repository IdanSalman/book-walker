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
