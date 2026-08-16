import { MD_UUID_RE } from "@/lib/mangadex-api";

export type ChapterRef = {
  sourceKey: string;
  payload: string;
};

export function encodeChapterId(sourceKey: string, payload: string): string {
  if (sourceKey === "mangadex") return payload;
  return `${sourceKey}:${payload}`;
}

export function decodeChapterId(value: string): ChapterRef | null {
  if (MD_UUID_RE.test(value)) {
    return { sourceKey: "mangadex", payload: value };
  }
  const idx = value.indexOf(":");
  if (idx <= 0) return null;
  const sourceKey = value.slice(0, idx);
  const payload = value.slice(idx + 1);
  if (!sourceKey || !payload) return null;
  return { sourceKey, payload };
}

export function isChapterId(value: string): boolean {
  return decodeChapterId(value) != null;
}

export function readerChapterHref(bookId: string, chapterId: string): string {
  return `/read/${bookId}/${encodeURIComponent(chapterId)}`;
}

export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function titlesMatch(a: string, b: string): boolean {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);
  return left.length > 0 && left === right;
}
