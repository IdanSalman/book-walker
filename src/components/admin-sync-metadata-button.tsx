"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Book } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { syncBookMetadataAction } from "@/lib/actions/admin";
import { canSyncMetadata } from "@/lib/publication";

export function AdminSyncMetadataButton({
  book,
  onUpdated,
}: {
  book: Book;
  onUpdated?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSync = canSyncMetadata(book) || book.category === "MANGA";

  function handleSync() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await syncBookMetadataAction(book.id);
      if (result.error) setError(result.error);
      if (result.message) setMessage(result.message);
      onUpdated?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={pending || !canSync}
        onClick={handleSync}
      >
        {pending ? "Syncing…" : "Refetch chapter count"}
      </Button>
      <p className="text-xs text-zinc-500">
        {canSync
          ? book.sourceName?.trim()
            ? `Updates the chapter count from ${book.sourceName.trim()}.`
            : "Updates chapters from the current reading source, or AniList / MangaDex."
          : "Set a reading source, AniList external ID, or MangaDex URL to enable refetch."}
      </p>
      {book.lastSyncedAt && (
        <p className="text-xs text-zinc-600">
          Last synced:{" "}
          {new Date(book.lastSyncedAt).toLocaleString("en-US")}
        </p>
      )}
      {message && <p className="text-sm text-emerald-400">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
