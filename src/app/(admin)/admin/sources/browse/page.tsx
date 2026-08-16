import Link from "next/link";

import {
  AdminMihonBrowseFilters,
  AdminMihonSourcePicker,
} from "@/components/admin-mihon-catalog";
import { parseAdminPage } from "@/lib/admin-pagination";
import { prisma } from "@/lib/prisma";
import {
  fetchMihonCatalog,
  filterMihonCatalog,
  isMihonSourceConfigured,
  languageLabel,
  mihonCatalogHref,
  mihonCatalogLanguages,
  MIHON_CATALOG_PAGE_SIZE,
  parseMihonLang,
  parseMihonStatus,
} from "@/lib/sources/mihon-catalog";

export default async function AdminMihonBrowsePage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    lang?: string;
    hideAdult?: string;
    status?: string;
  }>;
}) {
  const {
    page: pageParam,
    q,
    lang: langParam,
    hideAdult: hideAdultParam,
    status: statusParam,
  } = await searchParams;

  const query = q?.trim() ?? "";
  const lang = parseMihonLang(langParam);
  const hideAdult = hideAdultParam === "1" || hideAdultParam === "true";
  const status = parseMihonStatus(statusParam);
  const page = parseAdminPage(pageParam);

  let catalogError: string | null = null;
  let catalog: Awaited<ReturnType<typeof fetchMihonCatalog>> = [];
  try {
    catalog = await fetchMihonCatalog();
  } catch (err) {
    catalogError = err instanceof Error ? err.message : "Could not load catalog";
  }

  const configured = catalogError
    ? []
    : await prisma.fetchSource.findMany({
        select: { key: true, name: true, baseUrl: true, language: true },
      });

  const languages = mihonCatalogLanguages(catalog);
  const filtered = filterMihonCatalog(
    catalog,
    { q: query || undefined, lang, hideAdult, status, page },
    configured,
  );
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / MIHON_CATALOG_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * MIHON_CATALOG_PAGE_SIZE;
  const rows = filtered.slice(start, start + MIHON_CATALOG_PAGE_SIZE).map((source) => ({
    ...source,
    added: isMihonSourceConfigured(source, configured),
  }));

  const hrefParams = {
    q: query || undefined,
    lang,
    hideAdult,
    status,
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/sources"
          className="text-sm text-zinc-500 hover:text-zinc-300"
        >
          ← Back to sources
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-zinc-50">
          Browse Mihon sources
        </h1>
        <p className="mt-1 text-zinc-400">
          The Keiyoushi catalog Mihon uses. Add a site to track it in Book Walker.
          Search, import, and in-app reading stay limited to sources that already
          have an importer.
        </p>
      </div>

      {catalogError ? (
        <p className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {catalogError}
        </p>
      ) : (
        <>
          <p className="text-sm text-zinc-500">
            {total.toLocaleString()} source{total === 1 ? "" : "s"}
            {lang !== "*" ? ` in ${languageLabel(lang)}` : ""}
            {query ? ` matching “${query}”` : ""}
            {" · "}
            {catalog.length.toLocaleString()} in the Mihon catalog
          </p>

          <AdminMihonBrowseFilters
            query={query}
            lang={lang}
            hideAdult={hideAdult}
            status={status}
            languages={languages}
          />

          <AdminMihonSourcePicker sources={rows} />

          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-zinc-800 pt-4">
              <p className="text-sm text-zinc-500">
                Showing {start + 1}–{Math.min(start + rows.length, total)} of{" "}
                {total.toLocaleString()}
              </p>
              <nav className="flex items-center gap-2" aria-label="Mihon catalog pages">
                {currentPage > 1 ? (
                  <Link
                    href={mihonCatalogHref({ ...hrefParams, page: currentPage - 1 })}
                    className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-50"
                  >
                    Previous
                  </Link>
                ) : (
                  <span className="rounded-md px-3 py-1.5 text-sm text-zinc-600">
                    Previous
                  </span>
                )}
                <span className="px-2 text-sm text-zinc-400">
                  Page {currentPage} of {totalPages}
                </span>
                {currentPage < totalPages ? (
                  <Link
                    href={mihonCatalogHref({ ...hrefParams, page: currentPage + 1 })}
                    className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-50"
                  >
                    Next
                  </Link>
                ) : (
                  <span className="rounded-md px-3 py-1.5 text-sm text-zinc-600">
                    Next
                  </span>
                )}
              </nav>
            </div>
          )}
        </>
      )}
    </div>
  );
}
