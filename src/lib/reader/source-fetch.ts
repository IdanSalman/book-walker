import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";

import { isCloudflareChallenge, isToonilyHost } from "@/lib/reader/html";
import { readerFetchRevalidate } from "@/lib/reader/fetch-mode";

const execFileAsync = promisify(execFile);

const SOURCE_TIMEOUT_MS = 20_000;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/** Mihon Toonily.kt: addCookie("toonily-mature" to "1") so adult listings are not filtered. */
function extraSourceHeaders(url: string): Record<string, string> {
  try {
    if (isToonilyHost(new URL(url).hostname)) {
      return { Cookie: "toonily-mature=1" };
    }
  } catch {
    /* ignore */
  }
  return {};
}

function mergeSourceHeaders(
  url: string,
  headers: Record<string, string>,
): Record<string, string> {
  return { ...extraSourceHeaders(url), ...headers };
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "TimeoutError" ||
    error.name === "AbortError" ||
    /timed out/i.test(error.message)
  );
}

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
    ...mergeSourceHeaders(url, init?.headers ?? {}),
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
    req.setTimeout(SOURCE_TIMEOUT_MS, () => {
      req.destroy(new Error("Source request timed out"));
    });
    if (init?.body) req.write(init.body);
    req.end();
  });
}

function looksLikeTextResponse(res: Response): boolean {
  const contentType = res.headers.get("content-type") ?? "";
  return /html|json|text|xml|javascript/i.test(contentType) || !contentType;
}

async function withChallengeCheck(
  res: Response,
): Promise<{ res: Response; challenged: boolean }> {
  if (!looksLikeTextResponse(res)) return { res, challenged: false };
  const text = await res.text();
  return {
    res: new Response(text, { status: res.status, headers: res.headers }),
    challenged: isCloudflareChallenge(text),
  };
}

/** Last-resort GET: curl's TLS fingerprint often passes Cloudflare when Node does not. */
async function fetchViaCurl(
  url: string,
  headers: Record<string, string>,
): Promise<Response | null> {
  try {
    if (new URL(url).protocol !== "https:") return null;
  } catch {
    return null;
  }

  const dir = await mkdtemp(join(tmpdir(), "srcfetch-"));
  const bodyPath = join(dir, "body");
  const headerPath = join(dir, "headers");
  const bin = process.platform === "win32" ? "curl.exe" : "curl";
  const args = [
    "-sS",
    "-L",
    "--max-time",
    String(Math.ceil(SOURCE_TIMEOUT_MS / 1000)),
    "-D",
    headerPath,
    "-o",
    bodyPath,
    "-w",
    "%{http_code}",
  ];
  for (const [key, value] of Object.entries(headers)) {
    if (!value) continue;
    args.push("-H", `${key}: ${value}`);
  }
  args.push(url);

  try {
    const { stdout } = await execFileAsync(bin, args, {
      timeout: SOURCE_TIMEOUT_MS + 5_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    const status = Number.parseInt(String(stdout).trim(), 10);
    const body = await readFile(bodyPath);
    const rawHeaders = await readFile(headerPath, "utf8");
    const headerInit = new Headers();
    const blocks = rawHeaders.trim().split(/\r?\n\r?\n/);
    const last = blocks.at(-1) ?? "";
    for (const line of last.split(/\r?\n/)) {
      const idx = line.indexOf(":");
      if (idx <= 0) continue;
      const name = line.slice(0, idx).trim();
      if (/^transfer-encoding$/i.test(name)) continue;
      headerInit.append(name, line.slice(idx + 1).trim());
    }
    return new Response(body, {
      status: Number.isFinite(status) ? status : 502,
      headers: headerInit,
    });
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
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
  const revalidate = readerFetchRevalidate(init?.revalidate);
  const headers = mergeSourceHeaders(url, {
    Accept: init?.accept ?? "text/html,application/json;q=0.9,*/*;q=0.8",
    "User-Agent": BROWSER_UA,
    ...(init?.referer ? { Referer: init.referer } : {}),
    ...init?.headers,
  });
  const method = init?.method ?? "GET";
  const nodeInit = {
    method,
    headers,
    body: init?.body,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      ...nodeInit,
      signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
      ...(revalidate === false
        ? { cache: "no-store" as const }
        : { next: { revalidate } }),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new Error("Source request timed out");
    }
    throw error;
  }
  let challenged: boolean;
  ({ res, challenged } = await withChallengeCheck(res));

  if (challenged) {
    ({ res, challenged } = await withChallengeCheck(
      await fetchKeepingReferer(url, nodeInit),
    ));
  }

  if (
    (challenged || (!res.ok && (res.status === 403 || res.status === 404))) &&
    method === "GET" &&
    !init?.body
  ) {
    const viaCurl = await fetchViaCurl(url, headers);
    if (viaCurl && (viaCurl.ok || challenged)) {
      ({ res, challenged } = await withChallengeCheck(viaCurl));
    }
  }

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
