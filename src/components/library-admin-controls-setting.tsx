"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";

import { AnimatedSwitch } from "@/components/animated-switch";
import { updateShowLibraryAdminControls } from "@/lib/actions/preferences";

export function LibraryAdminControlsSetting({
  showLibraryAdminControls,
}: {
  showLibraryAdminControls: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimisticShow, setOptimisticShow] = useOptimistic(
    showLibraryAdminControls,
    (_current, show: boolean) => show,
  );

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-medium text-zinc-100">Library admin tools</h2>
          <p className="text-sm text-zinc-400">
            {optimisticShow
              ? "Safe/Visible toggles and reading tags are shown under each title in your library."
              : "Safe/Visible toggles and reading tags stay hidden under library titles."}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <AnimatedSwitch
            checked={optimisticShow}
            disabled={pending}
            aria-label="Show library admin tools"
            onCheckedChange={(show) => {
              startTransition(async () => {
                setOptimisticShow(show);
                await updateShowLibraryAdminControls(show);
                router.refresh();
              });
            }}
          />
          <span className="text-xs text-zinc-500">
            {pending ? "Saving…" : optimisticShow ? "Shown" : "Hidden"}
          </span>
        </div>
      </div>
    </div>
  );
}
