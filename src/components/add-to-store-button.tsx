"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { addTitleToStore } from "@/lib/actions/sources";
import type { CatalogConflict } from "@/lib/sources/import-title";

export function AddToStoreButton({
  sourceKey,
  titleId,
}: {
  sourceKey: string;
  titleId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{
    title: string;
    sourceName: string;
    existing: CatalogConflict[];
  } | null>(null);
  const [migrateBookId, setMigrateBookId] = useState("");

  function run(
    options?: { mode: "migrate" | "duplicate"; migrateBookId?: string },
  ) {
    setError(null);
    startTransition(async () => {
      const result = await addTitleToStore(sourceKey, titleId, options);
      if (result.conflict) {
        setConflict(result.conflict);
        setMigrateBookId(result.conflict.existing[0]?.id ?? "");
        return;
      }
      if (result.error) {
        setError(result.error);
        return;
      }
      setConflict(null);
      router.refresh();
    });
  }

  if (conflict && conflict.existing.length > 0) {
    const current = conflict.existing[0];
    const from = current?.sourceName?.trim() || "another source";
    return (
      <div className="space-y-2 rounded-lg border border-amber-900/50 bg-amber-950/20 p-3">
        <p className="text-xs text-amber-100/90">
          “{current?.title ?? conflict.title}” is already in the store from{" "}
          {from}. Migrate that listing to {conflict.sourceName}, or save a
          duplicate entry.
        </p>
        {conflict.existing.length > 1 && (
          <select
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
            value={migrateBookId}
            onChange={(event) => setMigrateBookId(event.target.value)}
          >
            {conflict.existing.map((book) => (
              <option key={book.id} value={book.id}>
                {book.title}
                {book.sourceName ? ` · ${book.sourceName}` : ""}
              </option>
            ))}
          </select>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={pending || !migrateBookId}
            onClick={() =>
              run({ mode: "migrate", migrateBookId: migrateBookId || undefined })
            }
          >
            {pending ? "Saving…" : `Migrate to ${conflict.sourceName}`}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run({ mode: "duplicate" })}
          >
            Save duplicate
          </Button>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Button disabled={pending} onClick={() => run()}>
        {pending ? "Adding…" : "Add to store"}
      </Button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
