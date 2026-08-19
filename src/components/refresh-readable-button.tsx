"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { refreshReadablePages } from "@/lib/actions/reader";

export function RefreshReadableButton({
  bookId,
  label,
  retryLabel,
  variant = "outline",
}: {
  bookId: string;
  label?: string;
  retryLabel?: string;
  variant?: "outline" | "secondary";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        size="sm"
        variant={variant}
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await refreshReadablePages(bookId);
            if (result.error) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        <RefreshCw className={pending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        {pending ? "Fetching…" : error ? retryLabel ?? "Try again" : label ?? "Refresh pages"}
      </Button>
      {error && <p className="max-w-md text-xs text-amber-400">{error}</p>}
    </div>
  );
}
