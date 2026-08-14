"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { AnimatedSwitch } from "@/components/animated-switch";
import { setCoverCorrupted } from "@/lib/actions/admin";

export function AdminCoverCorruptedToggle({
  bookId,
  coverCorrupted,
  compact,
  onUpdated,
}: {
  bookId: string;
  coverCorrupted: boolean;
  compact?: boolean;
  onUpdated?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle(checked: boolean) {
    startTransition(async () => {
      await setCoverCorrupted(bookId, checked);
      onUpdated?.();
      router.refresh();
    });
  }

  if (compact) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <AnimatedSwitch
          size="sm"
          checked={coverCorrupted}
          disabled={pending}
          onCheckedChange={toggle}
          aria-label={
            coverCorrupted
              ? "Cover hidden from store — click to show"
              : "Cover visible in store — click to hide"
          }
        />
        <span className="truncate text-[11px] leading-none text-zinc-400">
          {pending ? "…" : coverCorrupted ? "Hidden" : "Visible"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
      <div className="space-y-1">
        <p className="text-sm font-medium text-zinc-100">Hide from store</p>
        <p className="text-xs text-zinc-500">
          {coverCorrupted
            ? "Hidden — cover marked as broken (manual override)."
            : "Visible in the marketplace."}
        </p>
      </div>
      <AnimatedSwitch
        checked={coverCorrupted}
        disabled={pending}
        onCheckedChange={toggle}
        aria-label="Toggle hide cover from store"
      />
    </div>
  );
}
