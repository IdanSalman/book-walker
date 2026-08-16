"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { SelectField } from "@/components/ui/select";
import { sourceBrowseHref } from "@/lib/sources/browse";
import type { SourceCategory } from "@/lib/sources/browse";

export function SourceBrowseFilters({
  sourceKey,
  categories,
  categoryId,
  view,
}: {
  sourceKey: string;
  categories: SourceCategory[];
  categoryId?: string;
  view?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  if (categories.length === 0) return null;

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <SelectField
        label="Category"
        value={categoryId ?? ""}
        disabled={pending}
        onChange={(event) => {
          startTransition(() => {
            const next = event.target.value || undefined;
            const query = searchParams.get("q") ?? undefined;
            router.push(
              sourceBrowseHref(sourceKey, 1, {
                view,
                q: query,
                category: next,
              }),
            );
          });
        }}
        selectClassName="min-w-[12rem] sm:min-w-[14rem]"
      >
        <option value="">All categories</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </SelectField>
      {categoryId && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            startTransition(() => {
              const query = searchParams.get("q") ?? undefined;
              router.push(
                sourceBrowseHref(sourceKey, 1, {
                  view,
                  q: query,
                  category: undefined,
                }),
              );
            });
          }}
          className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
        >
          Clear category
        </button>
      )}
    </div>
  );
}
