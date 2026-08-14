import Link from "next/link";

import {
  adminBooksHref,
  adminPageCount,
  ADMIN_PAGE_SIZE,
} from "@/lib/admin-pagination";

type AdminPaginationProps = {
  total: number;
  page: number;
  q?: string;
  hideAdult?: boolean;
  genre?: string;
  sort?: string;
  corruptedCovers?: boolean;
  publication?: string;
};
export function AdminPagination({
  total,
  page,
  q,
  hideAdult,
  genre,
  sort,
  corruptedCovers,
  publication,
}: AdminPaginationProps) {
  const totalPages = adminPageCount(total);
  if (totalPages <= 1) return null;

  const start = (page - 1) * ADMIN_PAGE_SIZE + 1;
  const end = Math.min(page * ADMIN_PAGE_SIZE, total);
  const hrefParams = { q, hideAdult, genre, sort, corruptedCovers, publication };
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-zinc-800 pt-4">
      <p className="text-sm text-zinc-500">
        Showing {start}–{end} of {total.toLocaleString()}
      </p>
      <nav className="flex items-center gap-2" aria-label="Admin catalog pages">
        {page > 1 ? (
          <PageLink href={adminBooksHref({ page: page - 1, ...hrefParams })}>
            Previous
          </PageLink>
        ) : (
          <span className="rounded-md px-3 py-1.5 text-sm text-zinc-600">
            Previous
          </span>
        )}
        <span className="px-2 text-sm text-zinc-400">
          Page {page} of {totalPages}
        </span>
        {page < totalPages ? (
          <PageLink href={adminBooksHref({ page: page + 1, ...hrefParams })}>
            Next
          </PageLink>
        ) : (
          <span className="rounded-md px-3 py-1.5 text-sm text-zinc-600">
            Next
          </span>
        )}
      </nav>
    </div>
  );
}

function PageLink({
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
