"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { SelectField } from "@/components/ui/select";
import { CATEGORIES } from "@/lib/categories";
import {
  LIBRARY_SORT_OPTIONS,
  LIBRARY_STATUS_OPTIONS,
} from "@/lib/library-query";
import { PUBLICATION_FILTER_OPTIONS } from "@/lib/publication";

type LibraryFiltersProps = {
  category?: string;
  status?: string;
  publication?: string;
  sort: string;
  showPublicationFilter?: boolean;
};

export function LibraryFilters({
  category,
  status,
  publication,
  sort,
  showPublicationFilter = true,
}: LibraryFiltersProps) {
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
      router.push(query ? `/library?${query}` : "/library");
    });
  }

  const hasExtraFilters = Boolean(category || status || publication);

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <SelectField
        label="Type"
        value={category ?? ""}
        disabled={pending}
        onChange={(e) =>
          updateParams({ category: e.target.value || undefined })
        }
        selectClassName="min-w-[11rem]"
      >
        <option value="">All types</option>
        {CATEGORIES.map((option) => (
          <option key={option.slug} value={option.slug}>
            {option.label}
          </option>
        ))}
      </SelectField>

      <SelectField
        label="Status"
        value={status ?? ""}
        disabled={pending}
        onChange={(e) =>
          updateParams({ status: e.target.value || undefined })
        }
        selectClassName="min-w-[11rem]"
      >
        <option value="">All statuses</option>
        {LIBRARY_STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>

      {showPublicationFilter && (
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
      )}

      <SelectField
        label="Sort"
        value={sort}
        disabled={pending}
        onChange={(e) =>
          updateParams({ sort: e.target.value || undefined })
        }
        selectClassName="min-w-[11rem]"
      >
        {LIBRARY_SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>

      {hasExtraFilters && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            updateParams({
              category: undefined,
              status: undefined,
              publication: undefined,
            })
          }
          className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
