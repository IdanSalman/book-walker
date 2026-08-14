const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 512 * 1024;

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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    response = await fetch(coverUrl, {
      signal: controller.signal,
      headers: {
        Accept: "image/png,image/*",
        "User-Agent": "BookWalker/1.0 (cover-validator)",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);
  } catch {
    return true;
  }

  if (!response.ok) return true;

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const buffer = new Uint8Array(await response.arrayBuffer());

  if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) {
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
