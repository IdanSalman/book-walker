import { coverDisplayUrl, coverRefererForHost } from "@/lib/cover-url";
import { fetchKeepingReferer } from "@/lib/reader/source-fetch";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function coverFetchHeaders(
  url: string,
  accept: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept,
    "User-Agent": "BookWalker/1.0 (cover-validator)",
  };
  try {
    const referer = coverRefererForHost(new URL(url).hostname);
    if (referer) headers.Referer = referer;
  } catch {
    /* keep going without a Referer */
  }
  return headers;
}

/** URLs we treat as PNG covers (only these get scanned and can be flagged). */
export function isPngCoverUrl(url: string): boolean {
  if (!url?.trim()) return false;
  const lower = url.toLowerCase();
  return (
    lower.includes(".png") ||
    lower.includes("image/png") ||
    lower.includes("/png/") ||
    lower.includes("format=png")
  );
}

function isPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

function isLikelyImageBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  if (isPngSignature(bytes)) return true;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return true;
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return true;
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return true;
  }
  return (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  );
}

function hasValidPngImageData(bytes: Uint8Array): boolean {
  if (!isPngSignature(bytes) || bytes.length < 33) return false;

  const chunkType = String.fromCharCode(...bytes.slice(12, 16));
  if (chunkType !== "IHDR") return false;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0;
}

/**
 * Returns true when a PNG cover URL is broken and would not display an image.
 * Non-PNG URLs always return false (not classified as corrupted).
 */
export async function isPngCoverBroken(coverUrl: string): Promise<boolean> {
  if (!isPngCoverUrl(coverUrl)) return false;
  if (!coverUrl.trim()) return true;

  let response: Response;
  try {
    response = await fetchKeepingReferer(coverUrl, {
      headers: coverFetchHeaders(coverUrl, "image/png,image/*"),
    });
  } catch {
    return true;
  }

  if (!response.ok) return true;

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const buffer = new Uint8Array(await response.arrayBuffer());

  if (buffer.byteLength === 0) {
    return true;
  }

  const isPng =
    contentType.includes("image/png") || isPngSignature(buffer);

  if (!isPng) return true;

  return !hasValidPngImageData(buffer);
}

/** @deprecated Use isPngCoverBroken */
export async function isCoverCorrupted(coverUrl: string): Promise<boolean> {
  return isPngCoverBroken(coverUrl);
}

/** True when the cover URL returns image bytes that can be displayed. */
export async function coverImageLoads(coverUrl: string): Promise<boolean> {
  if (!coverUrl?.trim()) return false;
  const url = coverDisplayUrl(coverUrl.trim(), 256);

  if (isPngCoverUrl(url)) {
    return !(await isPngCoverBroken(url));
  }

  let response: Response;
  try {
    response = await fetchKeepingReferer(url, {
      headers: coverFetchHeaders(
        url,
        "image/avif,image/webp,image/jpeg,image/png,image/*",
      ),
    });
  } catch {
    return false;
  }

  if (!response.ok) return false;

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (!isLikelyImageBytes(buffer)) return false;
  if (
    contentType &&
    !contentType.startsWith("image/") &&
    !contentType.includes("octet-stream")
  ) {
    return false;
  }

  return true;
}

export type CoverScanResult = {
  id: string;
  coverUrl: string;
  corrupted: boolean;
  skipped: boolean;
};

export async function scanPngCoverStatuses(
  books: { id: string; coverUrl: string }[],
  concurrency = 8,
  onProgress?: (done: number, total: number) => void,
): Promise<CoverScanResult[]> {
  const results: CoverScanResult[] = new Array(books.length);
  let index = 0;
  let done = 0;

  async function worker() {
    while (index < books.length) {
      const i = index++;
      const book = books[i]!;
      if (!isPngCoverUrl(book.coverUrl)) {
        results[i] = {
          id: book.id,
          coverUrl: book.coverUrl,
          corrupted: false,
          skipped: true,
        };
      } else {
        const corrupted = await isPngCoverBroken(book.coverUrl);
        results[i] = {
          id: book.id,
          coverUrl: book.coverUrl,
          corrupted,
          skipped: false,
        };
      }
      done += 1;
      onProgress?.(done, books.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, books.length) }, worker),
  );

  return results;
}

export async function scanCoverStatuses(
  coverUrls: { id: string; coverUrl: string }[],
  concurrency = 8,
): Promise<Map<string, boolean>> {
  const results = await scanPngCoverStatuses(coverUrls, concurrency);
  return new Map(results.map((r) => [r.id, r.corrupted]));
}
