import Link from "next/link";

import { RefreshReadableButton } from "@/components/refresh-readable-button";

export function ReaderUnavailable({
  bookId,
  message,
}: {
  bookId: string;
  message: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-zinc-950 px-4 text-center">
      <p className="max-w-lg text-zinc-300">{message}</p>
      <RefreshReadableButton
        bookId={bookId}
        label="Retry loading pages"
        retryLabel="Try again"
        variant="secondary"
      />
      <Link href={`/books/${bookId}`} className="text-sm text-violet-400">
        Back to title
      </Link>
      <Link href="/library" className="text-sm text-zinc-500 hover:text-zinc-300">
        Back to library
      </Link>
    </div>
  );
}
