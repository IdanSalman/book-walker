"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";

import { AnimatedSwitch } from "@/components/animated-switch";
import { updateHideReadTitles } from "@/lib/actions/preferences";

export function HideReadTitlesSetting({
  hideReadTitles,
}: {
  hideReadTitles: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimisticHide, setOptimisticHide] = useOptimistic(
    hideReadTitles,
    (_current, hide: boolean) => hide,
  );

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-medium text-zinc-100">Already read titles</h2>
          <p className="text-sm text-zinc-400">
            {optimisticHide
              ? "Completed titles are hidden from your library, the store, and live source browse. Filter your library to Completed to see them again."
              : "Completed titles stay visible in your library and in the store."}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <AnimatedSwitch
            checked={optimisticHide}
            disabled={pending}
            aria-label="Hide already read titles"
            onCheckedChange={(hide) => {
              startTransition(async () => {
                setOptimisticHide(hide);
                await updateHideReadTitles(hide);
                router.refresh();
              });
            }}
          />
          <span className="text-xs text-zinc-500">
            {pending ? "Saving…" : optimisticHide ? "Hidden" : "Visible"}
          </span>
        </div>
      </div>
    </div>
  );
}
