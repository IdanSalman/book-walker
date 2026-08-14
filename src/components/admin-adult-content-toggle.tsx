"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { AnimatedSwitch } from "@/components/animated-switch";

export function AdminAdultContentToggle({
  hideAdult,
}: {
  hideAdult: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-100">Adult content</p>
        <p className="text-xs text-zinc-500">
          {hideAdult ? "Hidden from catalog" : "Shown in catalog"}
        </p>
      </div>
      <AnimatedSwitch
        checked={!hideAdult}
        disabled={pending}
        onCheckedChange={(showAdult) => {
          startTransition(() => {
            const params = new URLSearchParams(searchParams.toString());
            if (showAdult) params.delete("hideAdult");
            else params.set("hideAdult", "1");
            params.delete("page");
            const query = params.toString();
            router.push(query ? `/admin/books?${query}` : "/admin/books");
          });
        }}
      />
    </div>
  );
}
