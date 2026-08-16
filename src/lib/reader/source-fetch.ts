import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/**
 * Undici/Next fetch strips the Referer header. Manganato CDNs require it,
 * so image and scrape requests go through Node's http(s) client instead.
 */
export async function fetchKeepingReferer(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: "follow" | "manual";
  },
  redirects = 0,
): Promise<Response> {
  const target = new URL(url);
  const method = init?.method ?? "GET";
  const headers: Record<string, string> = {
    "Accept-Encoding": "identity",
    ...init?.headers,
  };
  if (init?.body && headers["Content-Length"] == null && headers["content-length"] == null) {
    headers["Content-Length"] = Buffer.byteLength(init.body).toString();
  }

  return new Promise((resolve, reject) => {
    const send = target.protocol === "http:" ? httpRequest : httpsRequest;
    const req = send(
      target,
      {
        method,
        headers,
      },
      (res) => {
        const status = res.statusCode ?? 502;
        const location = res.headers.location;
        if (
          location &&
          status >= 300 &&
          status < 400 &&
          (init?.redirect ?? "follow") === "follow" &&
          redirects < 5
        ) {
          res.resume();
          const next = new URL(location, target).toString();
          resolve(fetchKeepingReferer(next, init, redirects + 1));
          return;
        }

        const headerInit = new Headers();
        for (const [key, value] of Object.entries(res.headers)) {
          if (value == null || key === "transfer-encoding") continue;
          if (Array.isArray(value)) {
            for (const item of value) headerInit.append(key, item);
          } else {
            headerInit.set(key, value);
          }
        }

        resolve(
          new Response(Readable.toWeb(res) as ReadableStream, {
            status,
            headers: headerInit,
          }),
        );
      },
    );
    req.on("error", reject);
    req.setTimeout(25_000, () => {
      req.destroy(new Error("Source request timed out"));
    });
    if (init?.body) req.write(init.body);
    req.end();
  });
}

export async function sourceFetch(
  url: string,
  init?: {
    referer?: string;
    accept?: string;
    revalidate?: number | false;
    method?: "GET" | "POST";
    body?: string;
    headers?: Record<string, string>;
    throwOnError?: boolean;
  },
): Promise<Response> {
  const revalidate = init?.revalidate ?? 300;
  const headers = {
    Accept: init?.accept ?? "text/html,application/json;q=0.9,*/*;q=0.8",
    "User-Agent": BROWSER_UA,
    ...(init?.referer ? { Referer: init.referer } : {}),
    ...init?.headers,
  };
  const res = init?.referer
    ? await fetchKeepingReferer(url, {
        method: init?.method ?? "GET",
        headers,
        body: init?.body,
      })
    : await fetch(url, {
        method: init?.method ?? "GET",
        headers,
        body: init?.body,
        ...(revalidate === false
          ? { cache: "no-store" as const }
          : { next: { revalidate } }),
      });
  if (!res.ok && init?.throwOnError !== false) {
    throw new Error(`Source HTTP ${res.status}`);
  }
  return res;
}

export async function sourcePost(
  url: string,
  body: URLSearchParams | string,
  init?: Parameters<typeof sourceFetch>[1],
): Promise<Response> {
  const encoded = typeof body === "string" ? body : body.toString();
  return sourceFetch(url, {
    ...init,
    method: "POST",
    body: encoded,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      ...init?.headers,
    },
    throwOnError: init?.throwOnError ?? false,
    revalidate: init?.revalidate ?? false,
  });
}

export async function sourceText(
  url: string,
  init?: Parameters<typeof sourceFetch>[1],
): Promise<string> {
  return (await sourceFetch(url, init)).text();
}

export async function sourceJson<T>(
  url: string,
  init?: Parameters<typeof sourceFetch>[1],
): Promise<T> {
  return (await sourceFetch(url, { ...init, accept: "application/json" })).json() as Promise<T>;
}

export function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}

export function parseChapterNumber(value: string | null | undefined): number {
  if (!value) return -1;
  const match = value.match(/(\d+(?:\.\d+)?)/);
  if (!match) return -1;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : -1;
}

export function hostMatches(
  hostname: string,
  suffixes: string[],
): boolean {
  const host = hostname.toLowerCase();
  return suffixes.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}
