import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";

import {
  AdminSourceDeleteButton,
  AdminSourceEnabledToggle,
  AdminSourceResyncButton,
  AdminSourceTestButton,
} from "@/components/admin-source-actions";
import { AdminSourceForm } from "@/components/admin-source-form";
import { AdminSourceImportPanel } from "@/components/admin-source-import-panel";
import { Badge } from "@/components/ui/badge";
import { adminBooksHref } from "@/lib/admin-pagination";
import { prisma } from "@/lib/prisma";
import { sourceCatalogStats } from "@/lib/sources/catalog-stats";
import {
  canImportFromSource,
  SOURCE_HEALTH_LABELS,
  SOURCE_HEALTH_STYLES,
  SOURCE_KIND_LABELS,
} from "@/lib/sources/registry";

export default async function AdminSourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const source = await prisma.fetchSource.findUnique({ where: { id } });
  if (!source) notFound();

  const stats = await sourceCatalogStats(source);
  const canImport = canImportFromSource(source);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin/sources"
            className="text-sm text-zinc-500 hover:text-zinc-300"
          >
            ← Back to sources
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold text-zinc-50">{source.name}</h1>
            <Badge>{SOURCE_KIND_LABELS[source.kind]}</Badge>
            <Badge className={SOURCE_HEALTH_STYLES[source.health]}>
              {SOURCE_HEALTH_LABELS[source.health]}
            </Badge>
          </div>
          <a
            href={source.baseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-sm text-violet-400 hover:text-violet-300"
          >
            {source.baseUrl}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <AdminSourceEnabledToggle
            sourceId={source.id}
            enabled={source.enabled}
          />
          <AdminSourceDeleteButton sourceId={source.id} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Connection
          </h2>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-zinc-500">Status</dt>
              <dd>
                <Badge className={SOURCE_HEALTH_STYLES[source.health]}>
                  {SOURCE_HEALTH_LABELS[source.health]}
                </Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-zinc-500">Response time</dt>
              <dd className="text-zinc-100">
                {source.lastLatencyMs ? `${source.lastLatencyMs} ms` : "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-zinc-500">Last tested</dt>
              <dd className="text-zinc-100">
                {source.lastCheckedAt
                  ? new Date(source.lastCheckedAt).toLocaleString()
                  : "Never"}
              </dd>
            </div>
            {source.lastError && (
              <div>
                <dt className="text-zinc-500">Last error</dt>
                <dd className="mt-1 text-amber-400">{source.lastError}</dd>
              </div>
            )}
          </dl>
          <AdminSourceTestButton sourceId={source.id} />
        </section>

        <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Catalog coverage
          </h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Books" value={stats.total.toLocaleString()} />
            <Stat label="Unfinished" value={stats.ongoing.toLocaleString()} />
            <Stat label="Adult" value={stats.adult.toLocaleString()} />
            <Stat label="Never synced" value={stats.neverSynced.toLocaleString()} />
          </dl>
          <p className="text-xs text-zinc-500">
            Last metadata sync:{" "}
            {stats.lastSyncedAt
              ? new Date(stats.lastSyncedAt).toLocaleString()
              : "never"}
            {source.lastImportAt && (
              <>
                {" · "}last import{" "}
                {new Date(source.lastImportAt).toLocaleString()} (
                {source.importedCount.toLocaleString()} added in total)
              </>
            )}
          </p>
          <div className="flex flex-wrap items-start gap-4">
            <AdminSourceResyncButton
              sourceId={source.id}
              disabled={stats.total === 0}
            />
            {stats.total > 0 && (
              <Link
                href={adminBooksHref({ source: source.name })}
                className="text-sm text-violet-400 hover:text-violet-300"
              >
                View {stats.total.toLocaleString()} book
                {stats.total === 1 ? "" : "s"} in the catalog
              </Link>
            )}
          </div>
        </section>
      </div>

      {canImport ? (
        <AdminSourceImportPanel
          sourceId={source.id}
          sourceName={source.name}
          coverReferer={source.baseUrl}
        />
      ) : (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Fetching titles
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Turn on Catalog search in settings to look up titles on {source.name}.
            In-app reading uses the same scrape once Reading is enabled. Cloudflare
            or unusual site themes can still block server-side fetches.
          </p>
          <Link
            href="/admin/books/new"
            className="mt-3 inline-block text-sm text-violet-400 hover:text-violet-300"
          >
            Add a book manually
          </Link>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-100">Settings</h2>
        <AdminSourceForm source={source} />
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="text-lg font-semibold text-zinc-100">{value}</dd>
    </div>
  );
}
