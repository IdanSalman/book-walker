"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { refreshCaughtUpManga } from "@/lib/actions/admin";

export function AdminRefreshCaughtUpButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function runRefresh() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await refreshCaughtUpManga();
      if (result.error) setError(result.error);
      if (result.message) setMessage(result.message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={runRefresh}
      >
        {pending ? "Checking fully-read manga…" : "Check fully-read manga for new chapters"}
      </Button>
      <p className="text-xs text-zinc-500">
        Refetches chapter lists for manga that someone has finished. New chapters
        update the catalog count and bring those titles back into libraries that
        hide caught-up series.
      </p>
      {message && <p className="text-sm text-emerald-400">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
