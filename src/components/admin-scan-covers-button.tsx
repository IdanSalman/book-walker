"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { scanAllPngCovers, scanBookCovers } from "@/lib/actions/admin";

export function AdminScanCoversButtons({ bookIds }: { bookIds: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function runScan(action: () => Promise<{ success?: boolean; message?: string; error?: string }>) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      if (result.message) setMessage(result.message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {bookIds.length > 0 && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => runScan(() => scanBookCovers(bookIds))}
          >
            {pending
              ? "Scanning…"
              : `Scan PNG covers on this page (${bookIds.length})`}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => runScan(() => scanAllPngCovers())}
        >
          {pending ? "Scanning all PNGs…" : "Scan all PNG covers in catalog"}
        </Button>
      </div>
      <p className="text-xs text-zinc-500">
        Checks PNG URLs only. Broken images are hidden from the store automatically.
        For large catalogs, prefer{" "}
        <code className="rounded bg-zinc-800 px-1 py-0.5">npm run scan:covers</code>.
      </p>
      {message && (
        <p className="text-sm text-emerald-400">{message}</p>
      )}
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
