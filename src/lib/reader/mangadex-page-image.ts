import { isMangaDexImageHost } from "@/lib/cover-url";
import { MD_UUID_RE } from "@/lib/mangadex-api";
import {
  isCompleteImageBytes,
  sniffImageContentType,
} from "@/lib/reader/image-bytes";
import { getPageList } from "@/lib/reader/mangadex-source";
import { fetchKeepingReferer } from "@/lib/reader/source-fetch";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const UPLOADS_ORIGIN = "https://uploads.mangadex.org";
const REPORT_URL = "https://api.mangadex.org/at-home/report";

export type MangaDexAtHomePath = {
  quality: "data" | "data-saver";
  hash: string;
  file: string;
};

export function parseMangaDexAtHomePath(
  url: URL,
): MangaDexAtHomePath | null {
  if (!isMangaDexImageHost(url.hostname)) return null;
  const match = url.pathname.match(
    /^\/(data-saver|data)\/([^/]+)\/([^/]+)$/i,
  );
  if (!match) return null;
  return {
    quality: match[1]!.toLowerCase() === "data-saver" ? "data-saver" : "data",
    hash: match[2]!,
    file: match[3]!,
  };
}

export function mangaDexUploadsUrl(path: MangaDexAtHomePath): string {
  return `${UPLOADS_ORIGIN}/${path.quality}/${path.hash}/${path.file}`;
}

function sameChapterFile(
  url: string,
  expected: MangaDexAtHomePath,
): boolean {
  try {
    const parsed = parseMangaDexAtHomePath(new URL(url));
    return (
      parsed != null &&
      parsed.hash === expected.hash &&
      parsed.file === expected.file
    );
  } catch {
    return false;
  }
}

function reportAtHome(
  url: string,
  success: boolean,
  bytes: number,
  duration: number,
) {
  void fetch(REPORT_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": BROWSER_UA,
    },
    body: JSON.stringify({
      url,
      success,
      cached: false,
      bytes,
      duration,
    }),
    cache: "no-store",
  }).catch(() => {
    /* reporting is best-effort */
  });
}

async function downloadMangaDexImage(url: string): Promise<{
  ok: boolean;
  bytes: Uint8Array;
  contentType: string;
}> {
  const started = Date.now();
  try {
    const res = await fetchKeepingReferer(url, {
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*,*/*",
        "User-Agent": BROWSER_UA,
        Referer: "https://mangadex.org/",
      },
    });
    const bytes = new Uint8Array(await res.arrayBuffer());
    const duration = Date.now() - started;
    const complete = res.ok && isCompleteImageBytes(bytes);
    reportAtHome(url, complete, bytes.byteLength, duration);
    return {
      ok: complete,
      bytes,
      contentType: sniffImageContentType(
        bytes,
        res.headers.get("content-type") ?? "",
      ),
    };
  } catch {
    reportAtHome(url, false, 0, Date.now() - started);
    return { ok: false, bytes: new Uint8Array(), contentType: "" };
  }
}

export async function fetchMangaDexReaderImage(
  target: URL,
  options: {
    chapterId?: string | null;
    dataSaver?: boolean;
  } = {},
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const parsed = parseMangaDexAtHomePath(target);
  const tried = new Set<string>();

  async function tryUrl(url: string) {
    if (tried.has(url)) return null;
    tried.add(url);
    const result = await downloadMangaDexImage(url);
    if (!result.ok) return null;
    return { bytes: result.bytes, contentType: result.contentType };
  }

  const first = await tryUrl(target.toString());
  if (first) return first;

  if (parsed) {
    const uploads = await tryUrl(mangaDexUploadsUrl(parsed));
    if (uploads) return uploads;
  }

  const chapterId = options.chapterId;
  if (!parsed || !chapterId || !MD_UUID_RE.test(chapterId)) {
    return null;
  }

  const dataSaver =
    options.dataSaver ?? parsed.quality === "data-saver";

  for (const forcePort443 of [false, true]) {
    try {
      const pages = await getPageList(chapterId, dataSaver, { forcePort443 });
      const urls: string[] = [];
      for (const page of pages) {
        if (sameChapterFile(page.url, parsed)) urls.push(page.url);
      }
      for (const url of urls) {
        const hit = await tryUrl(url);
        if (hit) return hit;
      }
    } catch {
      /* try the next at-home mode */
    }
  }

  return null;
}
