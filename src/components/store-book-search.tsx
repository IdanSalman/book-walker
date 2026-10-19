"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Input } from "@/components/ui/input";

function isLocalDevHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function StoreBookSearch({
  defaultValue,
  actionPath = "/library/add",
  placeholder = "Search by title, author, or artist…",
}: {
  defaultValue: string;
  actionPath?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [navigating, setNavigating] = useState(false);

  return (
    <form
      className="w-full"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const q = new FormData(form).get("q")?.toString().trim() ?? "";
        const params = new URLSearchParams(searchParams.toString());
        if (q) params.set("q", q);
        else params.delete("q");
        params.delete("page");
        const query = params.toString();
        const href = query ? `${actionPath}?${query}` : actionPath;
        // Local dev already refetches on router.push. The deployed app's
        // client cache can keep the previous list, so load the URL directly.
        if (!isLocalDevHost(window.location.hostname)) {
          setNavigating(true);
          window.location.assign(href);
          return;
        }
        startTransition(() => {
          router.push(href);
        });
      }}
    >
      <Input
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        disabled={pending || navigating}
      />
    </form>
  );
}
