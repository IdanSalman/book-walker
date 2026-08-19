"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Book } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { repairBookCoverAction } from "@/lib/actions/admin";

export function AdminRepairCoverButton({
  book,
  onUpdated,
}: {
  book: Pick<Book, "id" | "coverUrl" | "coverCorrupted" | "sourceName">;
  onUpdated?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => {
          setMessage(null);
          setError(null);
          startTransition(async () => {
            const result = await repairBookCoverAction(book.id);
            if (result.error) setError(result.error);
            if (result.message) setMessage(result.message);
            onUpdated?.();
            router.refresh();
          });
        }}
      >
        {pending ? "Finding cover…" : "Find cover from sources"}
      </Button>
      <p className="text-xs text-zinc-500">
        Reloads the cover from sources that match this title’s type (books stay
        on Open Library / Google Books, manga on comic sites). A comic source on
        a book is replaced.
      </p>
      {message && <p className="text-sm text-emerald-400">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
