"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { syncOngoingManga } from "@/lib/actions/admin";

export function AdminSyncOngoingButtons({ bookIds }: { bookIds: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function runSync() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await syncOngoingManga(bookIds);
      if (result.error) setError(result.error);
      if (result.message) setMessage(result.message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {bookIds.length > 0 && (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={runSync}
        >
          {pending
            ? "Syncing…"
            : `Refetch ongoing manga on this page`}
        </Button>
      )}
      <p className="text-xs text-zinc-500">
        Updates chapter counts for ongoing manga via AniList or MangaDex.
      </p>
      {message && <p className="text-sm text-emerald-400">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
