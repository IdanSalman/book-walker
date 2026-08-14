"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Input } from "@/components/ui/input";

export function StoreBookSearch({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="w-full"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const q = new FormData(form).get("q")?.toString().trim() ?? "";
        startTransition(() => {
          const params = new URLSearchParams(searchParams.toString());
          if (q) params.set("q", q);
          else params.delete("q");
          params.delete("page");
          const query = params.toString();
          router.push(query ? `/library/add?${query}` : "/library/add");
        });
      }}
    >
      <Input
        name="q"
        defaultValue={defaultValue}
        placeholder="Search by title, author, or artist…"
        disabled={pending}
      />
    </form>
  );
}
