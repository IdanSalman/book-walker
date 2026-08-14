"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { SelectField } from "@/components/ui/select";
import { PUBLICATION_FILTER_OPTIONS } from "@/lib/publication";
import { STORE_SORT_OPTIONS } from "@/lib/store-query";

type AdminFiltersProps = {
  genres: { genre: string; count: number }[];
  genre?: string;
  sort: string;
  publication?: string;
};
export function AdminFilters({
  genres,
  genre,
  sort,
  publication,
}: AdminFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function updateParams(updates: Record<string, string | undefined>) {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      params.delete("page");
      const query = params.toString();
      router.push(query ? `/admin/books?${query}` : "/admin/books");
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <SelectField
        label="Genre"
        value={genre ?? ""}
        disabled={pending}
        onChange={(e) => updateParams({ genre: e.target.value || undefined })}
        selectClassName="min-w-[12rem] sm:min-w-[14rem]"
      >
        <option value="">All genres</option>
        {genres.map((g) => (
          <option key={g.genre} value={g.genre}>
            {g.genre} ({g.count.toLocaleString()})
          </option>
        ))}
      </SelectField>

      <SelectField
        label="Publication"
        value={publication ?? ""}
        disabled={pending}
        onChange={(e) =>
          updateParams({ publication: e.target.value || undefined })
        }
        selectClassName="min-w-[11rem]"
      >
        <option value="">All publication statuses</option>
        {PUBLICATION_FILTER_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>

      <SelectField        label="Sort"
        value={sort}
        disabled={pending}
        onChange={(e) => updateParams({ sort: e.target.value || undefined })}
        selectClassName="min-w-[11rem]"
      >
        {STORE_SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>

      {publication && (
        <button
          type="button"
          disabled={pending}
          onClick={() => updateParams({ publication: undefined })}
          className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
        >
          Clear publication filter
        </button>
      )}

      {genre && (        <button
          type="button"
          disabled={pending}
          onClick={() => updateParams({ genre: undefined })}
          className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
        >
          Clear genre: {genre}
        </button>
      )}
    </div>
  );
}
