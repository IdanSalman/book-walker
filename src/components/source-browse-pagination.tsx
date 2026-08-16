import Link from "next/link";

import { SOURCE_BROWSE_PAGE_SIZE, sourceBrowseHref } from "@/lib/sources/browse";

export function SourceBrowsePagination({
  sourceKey,
  page,
  hasMore,
  total,
  view,
  q,
  category,
  count,
}: {
  sourceKey: string;
  page: number;
  hasMore: boolean;
  total?: number;
  view?: string;
  q?: string;
  category?: string;
  count: number;
}) {
  if (page <= 1 && !hasMore) return null;

  const params = { view, q, category };
  const start = (page - 1) * SOURCE_BROWSE_PAGE_SIZE + 1;
  const end = start + count - 1;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-zinc-800 pt-6">
      <p className="text-sm text-zinc-500">
        {total != null
          ? `Showing ${start}–${Math.min(end, total)} of ${total.toLocaleString()} titles`
          : `Showing ${start}–${end}`}
      </p>
      <nav className="flex items-center gap-2" aria-label="Source pages">
        {page > 1 ? (
          <PaginationLink href={sourceBrowseHref(sourceKey, page - 1, params)}>
            Previous
          </PaginationLink>
        ) : (
          <span className="rounded-md px-3 py-1.5 text-sm text-zinc-600">
            Previous
          </span>
        )}
        <span className="px-2 text-sm text-zinc-400">Page {page}</span>
        {hasMore ? (
          <PaginationLink href={sourceBrowseHref(sourceKey, page + 1, params)}>
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
