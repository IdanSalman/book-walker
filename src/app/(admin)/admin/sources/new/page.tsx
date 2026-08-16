import Link from "next/link";

import { AdminSourceForm } from "@/components/admin-source-form";

export default async function NewSourcePage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string }>;
}) {
  const { name } = await searchParams;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/admin/sources"
          className="text-sm text-zinc-500 hover:text-zinc-300"
        >
          ← Back to sources
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-zinc-50">Add a source</h1>
        <p className="mt-1 text-zinc-400">
          Register a website the catalog fetches from, or{" "}
          <Link href="/admin/sources/browse" className="text-violet-400 hover:text-violet-300">
            browse Mihon’s catalog
          </Link>{" "}
          and pick sites from there. MangaDex, Asura Scans, and Weeb Central can
          search, import, and read titles.
        </p>
      </div>

      <AdminSourceForm defaultName={name?.trim() || undefined} />
    </div>
  );
}
