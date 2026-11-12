"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useLibraryCaughtUp } from "@/components/library-caught-up-provider";
import {
  UNCATEGORIZED_NAME,
  UNCATEGORIZED_SLUG,
} from "@/lib/library-categories";
import { visibleLibraryCount } from "@/lib/library-caught-up-view";
import {
  libraryPageHref,
  type LibraryHrefParams,
} from "@/lib/library-query";

type CollectionChip = {
  id: string;
  name: string;
  slug: string;
  count: number;
  caughtUpCount: number;
};

export function LibraryCollectionBar({
  categories,
  uncategorizedCount,
  uncategorizedCaughtUpCount,
  totalCount,
  totalCaughtUpCount,
  selectedSlug,
  filterParams,
}: {
  categories: CollectionChip[];
  uncategorizedCount: number;
  uncategorizedCaughtUpCount: number;
  totalCount: number;
  totalCaughtUpCount: number;
  selectedSlug?: string;
  filterParams: LibraryHrefParams;
}) {
  const { hideCaughtUp } = useLibraryCaughtUp();
  const uncategorizedVisible = visibleLibraryCount(
    uncategorizedCount,
    uncategorizedCaughtUpCount,
    hideCaughtUp,
  );

  return (
    <div className="flex flex-wrap gap-2">
      <FilterChip
        href={libraryPageHref({ ...filterParams, collection: undefined })}
        active={!selectedSlug}
      >
        All
        <ChipCount>
          {visibleLibraryCount(totalCount, totalCaughtUpCount, hideCaughtUp)}
        </ChipCount>
      </FilterChip>
      {categories.map((cat) => {
        const visible = visibleLibraryCount(
          cat.count,
          cat.caughtUpCount,
          hideCaughtUp,
        );
        if (visible === 0 && selectedSlug !== cat.slug) return null;
        return (
          <FilterChip
            key={cat.id}
            href={libraryPageHref({ ...filterParams, collection: cat.slug })}
            active={selectedSlug === cat.slug}
          >
            {cat.name}
            <ChipCount>{visible}</ChipCount>
          </FilterChip>
        );
      })}
      {(uncategorizedVisible > 0 || selectedSlug === UNCATEGORIZED_SLUG) && (
        <FilterChip
          href={libraryPageHref({
            ...filterParams,
            collection: UNCATEGORIZED_SLUG,
          })}
          active={selectedSlug === UNCATEGORIZED_SLUG}
        >
          {UNCATEGORIZED_NAME}
          <ChipCount>{uncategorizedVisible}</ChipCount>
        </FilterChip>
      )}
    </div>
  );
}

function ChipCount({ children }: { children: ReactNode }) {
  return <span className="text-[11px] opacity-70">{children}</span>;
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      prefetch={false}
      className={
        active
          ? "inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-3 py-1.5 text-sm font-medium text-white"
          : "inline-flex items-center gap-1.5 rounded-full border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200"
      }
    >
      {children}
    </Link>
  );
}
