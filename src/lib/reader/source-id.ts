import { MD_UUID_RE } from "@/lib/mangadex-api";

export type ChapterRef = {
  sourceKey: string;
  payload: string;
};

export function encodeChapterId(sourceKey: string, payload: string): string {
  if (sourceKey === "mangadex") return payload;
  return `${sourceKey}:${payload}`;
}

export function decodeChapterIdParam(raw: string): string {
  let value = raw.trim();
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(value);
      if (next === value) break;
      value = next;
    } catch {
      break;
    }
  }
  return value;
}

export function decodeChapterId(value: string): ChapterRef | null {
  const normalized = decodeChapterIdParam(value);
  if (MD_UUID_RE.test(normalized)) {
    return { sourceKey: "mangadex", payload: normalized };
  }
  const idx = normalized.indexOf(":");
  if (idx <= 0) return null;
  const sourceKey = normalized.slice(0, idx);
  const payload = normalized.slice(idx + 1);
  if (!sourceKey || !payload) return null;
  return { sourceKey, payload };
}

export function isChapterId(value: string): boolean {
  return decodeChapterId(value) != null;
}

/** Strip Asura's rotating 8-character comic-url suffix. */
export function mangaSlugKey(value: string): string {
  return value.replace(/-[a-z0-9]{8}$/i, "").toLowerCase();
}

function payloadTail(payload: string): { stem: string; tail: string } {
  const sep = payload.lastIndexOf(":");
  if (sep <= 0) return { stem: payload, tail: payload };
  return { stem: payload.slice(0, sep), tail: payload.slice(sep + 1) };
}

/** Match a reader URL to a chapter even when the source slug hash changed. */
export function findChapterIndex(
  chapters: { id: string }[],
  chapterId: string,
): number {
  const wanted = decodeChapterIdParam(chapterId);
  const exact = chapters.findIndex((chapter) => chapter.id === wanted);
  if (exact >= 0) return exact;

  const wantedRef = decodeChapterId(wanted);
  if (!wantedRef) return -1;
  const wantedParts = payloadTail(wantedRef.payload);

  return chapters.findIndex((chapter) => {
    const ref = decodeChapterId(chapter.id);
    if (!ref || ref.sourceKey !== wantedRef.sourceKey) return false;
    if (ref.payload === wantedRef.payload) return true;
    const have = payloadTail(ref.payload);
    return (
      have.tail === wantedParts.tail &&
      mangaSlugKey(have.stem) === mangaSlugKey(wantedParts.stem)
    );
  });
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
