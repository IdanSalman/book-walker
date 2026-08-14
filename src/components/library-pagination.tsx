import Link from "next/link";

import { libraryPageHref, type LibraryHrefParams } from "@/lib/library-query";
import {
  LIBRARY_PAGE_SIZE,
  libraryPageCount,
} from "@/lib/library-pagination";

type LibraryPaginationProps = LibraryHrefParams & {
  total: number;
  page: number;
};

export function LibraryPagination({
  total,
  page,
  ...params
}: LibraryPaginationProps) {
  const totalPages = libraryPageCount(total);
  if (totalPages <= 1) return null;

  const start = (page - 1) * LIBRARY_PAGE_SIZE + 1;
  const end = Math.min(page * LIBRARY_PAGE_SIZE, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-zinc-800 pt-6">
      <p className="text-sm text-zinc-500">
        Showing {start}–{end} of {total.toLocaleString()} titles
      </p>
      <nav className="flex items-center gap-2" aria-label="Library pages">
        {page > 1 ? (
          <PaginationLink href={libraryPageHref({ ...params, page: page - 1 })}>
            Previous
          </PaginationLink>
        ) : (
          <span className="rounded-md px-3 py-1.5 text-sm text-zinc-600">
            Previous
          </span>
        )}
        <span className="px-2 text-sm text-zinc-400">
          Page {page} of {totalPages}
        </span>
        {page < totalPages ? (
          <PaginationLink href={libraryPageHref({ ...params, page: page + 1 })}>
            Next
          </PaginationLink>
        ) : (
          <span className="rounded-md px-3 py-1.5 text-sm text-zinc-600">
            Next
          </span>
        )}
      </nav>
    </div>
  );
}

function PaginationLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-50"
    >
      {children}
    </Link>
  );
}
