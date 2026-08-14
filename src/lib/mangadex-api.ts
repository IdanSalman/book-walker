const MANGADEX_API = "https://api.mangadex.org";
const USER_AGENT =
  "BookWalker/0.1 (personal library reader; Mihon-compatible MangaDex source)";
export const MD_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type MangaDexInit = Omit<RequestInit, "cache" | "next"> & {
  revalidate?: number | false;
};

export async function mangadexFetch(
  path: string,
  init?: MangaDexInit,
  attempt = 0,
): Promise<Response> {
  const { revalidate, headers, ...rest } = init ?? {};

  const res = await fetch(`${MANGADEX_API}${path}`, {
    ...rest,
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      ...headers,
    },
    ...(revalidate === false
      ? { cache: "no-store" as const }
      : { next: { revalidate: revalidate ?? 300 } }),
  });

  if (res.status === 429) {
    if (attempt >= 5) throw new Error("MangaDex rate limit exceeded");
    await sleep(1500 * 2 ** attempt);
    return mangadexFetch(path, init, attempt + 1);
  }

  if (!res.ok) {
    throw new Error(`MangaDex HTTP ${res.status}`);
  }

  return res;
}

export { isMangaDexImageHost } from "@/lib/cover-url";
