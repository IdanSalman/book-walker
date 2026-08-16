import Link from "next/link";
import { ExternalLink } from "lucide-react";

import {
  AdminAddAllBuiltInSourcesButton,
  AdminAddBuiltInSourceButton,
  AdminSourceEnabledToggle,
  AdminTestAllSourcesButton,
} from "@/components/admin-source-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminBooksHref } from "@/lib/admin-pagination";
import { prisma } from "@/lib/prisma";
import {
  booksWithoutSourceCount,
  catalogSourceNames,
  sourceCatalogCount,
  sourceNameMatches,
} from "@/lib/sources/catalog-stats";
import {
  BUILT_IN_SOURCES,
  canImportFromSource,
  SOURCE_HEALTH_LABELS,
  SOURCE_HEALTH_STYLES,
  SOURCE_KIND_LABELS,
} from "@/lib/sources/registry";

export default async function AdminSourcesPage() {
  const [sources, catalogNames, unassigned] = await Promise.all([
    prisma.fetchSource.findMany({
      orderBy: [{ priority: "desc" }, { name: "asc" }],
    }),
    catalogSourceNames(),
    booksWithoutSourceCount(),
  ]);

  const configuredKeys = new Set(sources.map((source) => source.key));
  const missingBuiltIns = BUILT_IN_SOURCES.filter(
    (preset) => !configuredKeys.has(preset.key),
  );
  const unmanagedNames = catalogNames.filter(
    (row) => !sources.some((source) => sourceNameMatches(row.name, source)),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-zinc-50">Fetch sources</h1>
          <p className="mt-1 text-zinc-400">
            {sources.length === 0
              ? "No websites configured yet."
              : `${sources.length} website${sources.length === 1 ? "" : "s"} — ${
                  sources.filter((source) => source.enabled).length
                } enabled.`}{" "}
            Browse Mihon’s Keiyoushi catalog to add sites, or register one
            manually. MangaDex, Asura Scans, and Weeb Central can import titles
            and power in-app reading.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <AdminTestAllSourcesButton />
          <Link href="/admin/sources/browse">
            <Button variant="secondary">Browse Mihon sources</Button>
          </Link>
          <Link href="/admin/sources/new">
            <Button>Add source</Button>
          </Link>
        </div>
      </div>

      {sources.length === 0 ? (
        <div className="space-y-4 rounded-xl border border-dashed border-zinc-800 px-6 py-12 text-center">
          <p className="text-zinc-400">
            Browse the Mihon catalog, or start with the built-in presets —{" "}
            {BUILT_IN_SOURCES.map((preset) => preset.name).join(", ")}.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/admin/sources/browse">
              <Button variant="secondary">Browse Mihon sources</Button>
            </Link>
            <AdminAddAllBuiltInSourcesButton />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sources.map((source) => {
            const bookCount = sourceCatalogCount(catalogNames, source);

            return (
              <article
                key={source.id}
                className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/30 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-semibold text-zinc-50">
                        {source.name}
                      </h2>
                      <Badge>{SOURCE_KIND_LABELS[source.kind]}</Badge>
                      <Badge className={SOURCE_HEALTH_STYLES[source.health]}>
                        {SOURCE_HEALTH_LABELS[source.health]}
                        {source.health !== "UNKNOWN" && source.lastLatencyMs
                          ? ` · ${source.lastLatencyMs} ms`
                          : ""}
                      </Badge>
                    </div>
                    <a
                      href={source.baseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
                    >
                      {source.baseUrl.replace(/^https?:\/\//, "")}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <AdminSourceEnabledToggle
                    sourceId={source.id}
                    enabled={source.enabled}
                    compact
                  />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {canImportFromSource(source) && (
                    <Badge className="border-violet-900/50 bg-violet-950/50 text-violet-300">
                      Importer
                    </Badge>
                  )}
                  {source.supportsSearch && <Badge>Search</Badge>}
                  {source.supportsMetadata && <Badge>Metadata</Badge>}
                  {source.supportsReading && <Badge>Reading</Badge>}
                  {source.isAdultSource && (
                    <Badge className="border-red-900/50 bg-red-950/50 text-red-300">
                      Adult
                    </Badge>
                  )}
                  <Badge className="border-zinc-800 bg-zinc-900 text-zinc-400">
                    {source.language}
                  </Badge>
                </div>

                {source.lastError && (
                  <p className="text-xs text-amber-400">{source.lastError}</p>
                )}

                <dl className="grid grid-cols-2 gap-3 border-t border-zinc-800 pt-3 text-sm">
                  <div>
                    <dt className="text-xs text-zinc-500">In catalog</dt>
                    <dd className="font-medium text-zinc-100">
                      {bookCount.toLocaleString()} book
                      {bookCount === 1 ? "" : "s"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">Last tested</dt>
                    <dd className="font-medium text-zinc-100">
                      {source.lastCheckedAt
                        ? new Date(source.lastCheckedAt).toLocaleString()
                        : "Never"}
                    </dd>
                  </div>
                </dl>

                <div className="flex flex-wrap gap-3 pt-1">
                  <Link href={`/admin/sources/${source.id}`}>
                    <Button variant="secondary" size="sm">
                      Manage
                    </Button>
                  </Link>
                  {bookCount > 0 && (
                    <Link
                      href={adminBooksHref({ source: source.name })}
                      className="self-center text-sm text-violet-400 hover:text-violet-300"
                    >
                      View in catalog
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {missingBuiltIns.length > 0 && sources.length > 0 && (
        <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <div>
            <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
              Built-in sources not added
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Presets with sensible defaults for capabilities and connection tests.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {missingBuiltIns.map((preset) => (
              <AdminAddBuiltInSourceButton
                key={preset.key}
                sourceKey={preset.key}
                label={`Add ${preset.name}`}
              />
            ))}
          </div>
        </section>
      )}

      {unmanagedNames.length > 0 && (
        <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <div>
            <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
              Sites found in the catalog
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              These source names appear on catalog entries but are not managed here
              yet.
            </p>
          </div>
          <ul className="divide-y divide-zinc-800 text-sm">
            {unmanagedNames.slice(0, 12).map((row) => (
              <li
                key={row.name}
                className="flex flex-wrap items-center justify-between gap-3 py-2"
              >
                <span className="text-zinc-200">{row.name}</span>
                <span className="flex items-center gap-4">
                  <span className="text-xs text-zinc-500">
                    {row.count.toLocaleString()} book{row.count === 1 ? "" : "s"}
                  </span>
                  <Link
                    href={`/admin/sources/new?name=${encodeURIComponent(row.name)}`}
                    className="text-violet-400 hover:text-violet-300"
                  >
                    Add as source
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {unassigned > 0 && (
        <p className="text-sm text-zinc-500">
          {unassigned.toLocaleString()} catalog book
          {unassigned === 1 ? " has" : "s have"} no source name.{" "}
          <Link
            href={adminBooksHref({})}
            className="text-violet-400 hover:text-violet-300"
          >
            Review the catalog
          </Link>
          .
        </p>
      )}
    </div>
  );
}
