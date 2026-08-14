"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";

import { AnimatedSwitch } from "@/components/animated-switch";
import { updateHideAdultContent } from "@/lib/actions/preferences";

export function AdultContentSetting({
  hideAdultContent,
}: {
  hideAdultContent: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimisticShowAdult, setOptimisticShowAdult] = useOptimistic(
    !hideAdultContent,
    (_current, showAdult: boolean) => showAdult,
  );

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-medium text-zinc-100">Adult content</h2>
          <p className="text-sm text-zinc-400">
            {optimisticShowAdult
              ? "Adult titles are visible across the site, including the store and your library."
              : "Adult titles are hidden across the site, including the store and your library."}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <AnimatedSwitch
            checked={optimisticShowAdult}
            disabled={pending}
            onCheckedChange={(showAdult) => {
              startTransition(async () => {
                setOptimisticShowAdult(showAdult);
                await updateHideAdultContent(!showAdult);
                router.refresh();
              });
            }}
          />
          <span className="text-xs text-zinc-500">
            {pending ? "Saving…" : optimisticShowAdult ? "Enabled" : "Disabled"}
          </span>
        </div>
      </div>
    </div>
  );
}
