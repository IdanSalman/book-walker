import { coverImageLoads } from "@/lib/cover-validation";
import { sourceJson } from "@/lib/reader/source-fetch";
import { titlesMatch } from "@/lib/reader/source-id";

type GoogleBooksVolume = {
  id?: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    description?: string;
    pageCount?: number;
    infoLink?: string;
    canonicalVolumeLink?: string;
    imageLinks?: {
      extraLarge?: string;
      large?: string;
      medium?: string;
      thumbnail?: string;
      smallThumbnail?: string;
    };
  };
};

type GoogleBooksSearch = {
  items?: GoogleBooksVolume[];
};

function httpsCover(url: string): string {
  return url.replace(/^http:\/\//i, "https://").replace(/&edge=curl/i, "");
}

function coverFromVolume(volume: GoogleBooksVolume): string {
  const info = volume.volumeInfo;
  const links = info?.imageLinks;
  const raw =
    links?.extraLarge ??
    links?.large ??
    links?.medium ??
    links?.thumbnail ??
    links?.smallThumbnail ??
    "";
  if (raw) return httpsCover(raw);
  if (!volume.id) return "";
  return `https://books.google.com/books/content?id=${encodeURIComponent(volume.id)}&printsec=frontcover&img=1&zoom=1`;
}

function searchQuery(title: string, author?: string | null): string {
  const quoted = `intitle:"${title.trim()}"`;
  const who = author?.trim();
  return who ? `${quoted} inauthor:"${who}"` : quoted;
}

export type GoogleBooksCoverHit = {
  coverUrl: string;
  sourceKey: string;
  sourceName: string;
  url: string;
  author?: string | null;
  summary?: string | null;
  pageCount?: number;
};

export async function findGoogleBooksCover(
  title: string,
  author?: string | null,
): Promise<GoogleBooksCoverHit | null> {
  const trimmed = title.trim();
  if (!trimmed) return null;

  const params = new URLSearchParams({
    q: searchQuery(trimmed, author),
    maxResults: "8",
    printType: "books",
    fields:
      "items(id,volumeInfo/title,volumeInfo/authors,volumeInfo/description,volumeInfo/pageCount,volumeInfo/infoLink,volumeInfo/canonicalVolumeLink,volumeInfo/imageLinks)",
  });

  try {
    const json = await sourceJson<GoogleBooksSearch>(
      `https://www.googleapis.com/books/v1/volumes?${params}`,
      { revalidate: 3600, accept: "application/json" },
    );
    const items = json.items ?? [];
    const ranked = [...items].sort((left, right) => {
      const leftTitle = left.volumeInfo?.title ?? "";
      const rightTitle = right.volumeInfo?.title ?? "";
      return (
        Number(titlesMatch(rightTitle, trimmed)) -
        Number(titlesMatch(leftTitle, trimmed))
      );
    });

    for (const item of ranked) {
      const info = item.volumeInfo;
      const coverUrl = coverFromVolume(item);
      if (!coverUrl || !(await coverImageLoads(coverUrl))) continue;
      const url =
        info?.canonicalVolumeLink ??
        info?.infoLink ??
        "https://books.google.com/";
      return {
        coverUrl,
        sourceKey: "googlebooks",
        sourceName: "Google Books",
        url,
        author: info?.authors?.[0] ?? null,
        summary: info?.description?.trim() || null,
        pageCount:
          typeof info?.pageCount === "number" && info.pageCount > 0
            ? info.pageCount
            : undefined,
      };
    }
  } catch {
    return null;
  }

  return null;
}
