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
          ? "Updates chapters and publication status from AniList or MangaDex."
          : "Set an AniList external ID or MangaDex source URL to enable refetch."}
      </p>
      {book.lastSyncedAt && (
        <p className="text-xs text-zinc-600">
          Last synced: {new Date(book.lastSyncedAt).toLocaleString()}
        </p>
      )}
      {message && <p className="text-sm text-emerald-400">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
