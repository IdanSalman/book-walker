import Link from "next/link";

import {
  storePageCount,
  storePageHref,
  STORE_PAGE_SIZE,
} from "@/lib/store-pagination";

type StorePaginationProps = {
  total: number;
  page: number;
  category?: string;
  genre?: string;
  sort?: string;
  q?: string;
  content?: string;
  publication?: string;
};
export function StorePagination({
  total,
  page,
  category,
  genre,
  sort,
  q,
  content,
  publication,
}: StorePaginationProps) {
  const totalPages = storePageCount(total);
  if (totalPages <= 1) return null;

  const params = { category, genre, sort, q, content, publication };  const start = (page - 1) * STORE_PAGE_SIZE + 1;
  const end = Math.min(page * STORE_PAGE_SIZE, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-zinc-800 pt-6">
      <p className="text-sm text-zinc-500">
        Showing {start}–{end} of {total.toLocaleString()} titles
      </p>
      <nav className="flex items-center gap-2" aria-label="Store pages">
        {page > 1 ? (
          <PaginationLink href={storePageHref(page - 1, params)}>
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
          <PaginationLink href={storePageHref(page + 1, params)}>
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
