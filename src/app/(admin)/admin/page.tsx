import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminBooksHref } from "@/lib/admin-pagination";
import { categoryLabel } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import {
  booksWithoutSourceCount,
  catalogSourceNames,
  sourceCatalogCount,
} from "@/lib/sources/catalog-stats";
import {
  SOURCE_HEALTH_LABELS,
  SOURCE_HEALTH_STYLES,
} from "@/lib/sources/registry";

export default async function AdminOverviewPage() {
  const [
    totalBooks,
    byCategory,
    adultBooks,
    hiddenCovers,
    ongoingBooks,
    neverSynced,
    withoutSource,
    sources,
    catalogNames,
    readers,
  ] = await Promise.all([
    prisma.book.count(),
    prisma.book.groupBy({ by: ["category"], _count: { _all: true } }),
    prisma.book.count({ where: { isAdult: true } }),
    prisma.book.count({ where: { coverCorrupted: true } }),
    prisma.book.count({
      where: { publicationStatus: { in: ["ONGOING", "HIATUS"] } },
    }),
    prisma.book.count({ where: { lastSyncedAt: null } }),
    booksWithoutSourceCount(),
    prisma.fetchSource.findMany({
      orderBy: [{ priority: "desc" }, { name: "asc" }],
    }),
    catalogSourceNames(),
    prisma.user.count(),
  ]);

  const enabledSources = sources.filter((source) => source.enabled).length;
  const unhealthy = sources.filter(
    (source) => source.enabled && source.health !== "ONLINE",
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-zinc-50">Overview</h1>
          <p className="mt-1 text-zinc-400">
            The shared catalog and the sites it is fetched from.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/books/new">
            <Button variant="secondary">Add book</Button>
          </Link>
          <Link href="/admin/sources">
            <Button>Manage sources</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Books in catalog"
          value={totalBooks.toLocaleString()}
          href={adminBooksHref({})}
        />
        <StatCard
          label="Unfinished titles"
          value={ongoingBooks.toLocaleString()}
          href={adminBooksHref({ publication: "ONGOING" })}
        />
        <StatCard
          label="Fetch sources"
          value={`${enabledSources} / ${sources.length}`}
          hint="enabled"
          href="/admin/sources"
        />
        <StatCard label="Readers" value={readers.toLocaleString()} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Catalog health
          </h2>
          <dl className="space-y-2 text-sm">
            {byCategory.map((row) => (
              <Row
                key={row.category}
                label={categoryLabel(row.category)}
                value={row._count._all.toLocaleString()}
              />
            ))}
            <Row label="Adult titles" value={adultBooks.toLocaleString()} />
            <Row
              label="Hidden (broken cover)"
              value={hiddenCovers.toLocaleString()}
              href={adminBooksHref({ corruptedCovers: true })}
            />
            <Row label="Never synced" value={neverSynced.toLocaleString()} />
            <Row label="No source name" value={withoutSource.toLocaleString()} />
          </dl>
        </section>

        <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Sources
          </h2>
          {sources.length === 0 ? (
            <p className="text-sm text-zinc-400">
              No fetch sources configured yet.{" "}
              <Link
                href="/admin/sources"
                className="text-violet-400 hover:text-violet-300"
              >
                Add MangaDex and friends
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y divide-zinc-800 text-sm">
              {sources.map((source) => (
                <li
                  key={source.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2"
                >
                  <Link
                    href={`/admin/sources/${source.id}`}
                    className="font-medium text-zinc-100 hover:text-violet-300"
                  >
                    {source.name}
                  </Link>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500">
                      {sourceCatalogCount(catalogNames, source).toLocaleString()}{" "}
                      books
                    </span>
                    {!source.enabled && <Badge>Disabled</Badge>}
                    <Badge className={SOURCE_HEALTH_STYLES[source.health]}>
                      {SOURCE_HEALTH_LABELS[source.health]}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {unhealthy.length > 0 && (
            <p className="text-xs text-amber-400">
              {unhealthy.length} enabled source
              {unhealthy.length === 1 ? "" : "s"} not confirmed online — run a
              connection test.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
}) {
  const card = (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 transition hover:border-zinc-700">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-50">
        {value}
        {hint && (
          <span className="ml-1 text-xs font-normal text-zinc-500">{hint}</span>
        )}
      </p>
    </div>
  );

  return href ? <Link href={href}>{card}</Link> : card;
}

function Row({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-zinc-400">
        {href ? (
          <Link href={href} className="hover:text-violet-300">
            {label}
          </Link>
        ) : (
          label
        )}
      </dt>
      <dd className="font-medium text-zinc-100">{value}</dd>
    </div>
  );
}
