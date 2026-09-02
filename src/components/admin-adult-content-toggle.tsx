"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { AnimatedSwitch } from "@/components/animated-switch";

export function AdminAdultContentToggle({
  adultOnly,
}: {
  adultOnly: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-100">Adult content</p>
        <p className="text-xs text-zinc-500">
          {adultOnly ? "Showing only adult titles" : "Adult titles hidden"}
        </p>
      </div>
      <AnimatedSwitch
        checked={adultOnly}
        disabled={pending}
        aria-label={
          adultOnly
            ? "Showing only adult titles — click to hide them"
            : "Adult titles hidden — click to show only adult titles"
        }
        onCheckedChange={(showOnlyAdult) => {
          startTransition(() => {
            const params = new URLSearchParams(searchParams.toString());
            if (showOnlyAdult) params.set("adult", "only");
            else params.delete("adult");
            params.delete("hideAdult");
            params.delete("page");
            const query = params.toString();
            router.push(query ? `/admin/books?${query}` : "/admin/books");
          });
        }}
      />
    </div>
  );
}
