import { ChapterList } from "@/components/chapter-list";
import { getMangaWithChapters } from "@/lib/reader/mangadex-source";
import type { ReaderChapter } from "@/lib/reader/types";

export async function ReadableChapterSection({
  book,
  currentPage,
}: {
  book: {
    id: string;
    title: string;
    sourceUrl: string | null;
    externalId: string | null;
  };
  currentPage: number;
}) {
  let chapters: ReaderChapter[] | null = null;
  let errorMessage: string | null = null;

  try {
    const resolved = await getMangaWithChapters(book);
    chapters = resolved.chapters;
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Chapters could not be loaded.";
  }

  if (errorMessage || !chapters) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Read
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          {errorMessage ?? "Chapters could not be loaded."}
        </p>
      </div>
    );
  }

  return (
    <ChapterList
      bookId={book.id}
      chapters={chapters}
      currentPage={currentPage}
    />
  );
}
