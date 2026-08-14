"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { AnimatedSwitch } from "@/components/animated-switch";
import { setBookAdult } from "@/lib/actions/admin";

export function AdminAdultToggle({
  bookId,
  isAdult,
  compact,
  onUpdated,
}: {
  bookId: string;
  isAdult: boolean;
  compact?: boolean;
  onUpdated?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle(checked: boolean) {
    startTransition(async () => {
      await setBookAdult(bookId, checked);
      onUpdated?.();
      router.refresh();
    });
  }

  if (compact) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <AnimatedSwitch
          size="sm"
          checked={isAdult}
          disabled={pending}
          onCheckedChange={toggle}
          aria-label={
            isAdult
              ? "Marked as adult — click to clear"
              : "Not adult — click to mark adult"
          }
        />
        <span className="truncate text-[11px] leading-none text-zinc-400">
          {pending ? "…" : isAdult ? "Adult" : "Safe"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
      <div className="space-y-1">
        <p className="text-sm font-medium text-zinc-100">Adult content</p>
        <p className="text-xs text-zinc-500">
          {isAdult
            ? "Marked as adult — hidden for users who disable adult content."
            : "Not marked as adult."}
        </p>
      </div>
      <AnimatedSwitch
        checked={isAdult}
        disabled={pending}
        onCheckedChange={toggle}
        aria-label="Toggle adult content"
      />
    </div>
  );
}
