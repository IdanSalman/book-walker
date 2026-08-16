import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminBookForm } from "@/components/admin-book-form";
import { AdminSyncMetadataButton } from "@/components/admin-sync-metadata-button";
import { CoverImage } from "@/components/cover-image";
import { DeleteBookButton } from "@/components/delete-book-button";
import { Badge } from "@/components/ui/badge";
import { categoryLabel } from "@/lib/categories";
import { PUBLICATION_STATUS_LABELS, pageCountLabel } from "@/lib/publication";
import { prisma } from "@/lib/prisma";

export default async function EditBookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const book = await prisma.book.findUnique({
    where: { id },
    include: { _count: { select: { userBooks: true } } },
  });
  if (!book) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin/books"
            className="text-sm text-zinc-500 hover:text-zinc-300"
          >
            ← Back to catalog
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-zinc-50">Edit book</h1>
          <p className="mt-1 text-zinc-400">{book.title}</p>
        </div>
        <DeleteBookButton bookId={book.id} />
      </div>

      <section className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <div className="space-y-4">
          <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
            <CoverImage
              src={book.coverUrl}
              alt={book.title}
              sizes="220px"
              priority
              size={512}
            />
          </div>
          <dl className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm">
            <div>
              <dt className="text-zinc-500">Readers</dt>
              <dd className="font-medium text-zinc-100">
                {book._count.userBooks}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Chapters / pages</dt>
              <dd className="font-medium text-zinc-100">
                {pageCountLabel(book.totalPages, book.publicationStatus)}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Publication</dt>
              <dd>
                <Badge>
                  {PUBLICATION_STATUS_LABELS[book.publicationStatus]}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Source</dt>
              <dd className="font-medium text-zinc-100">
                {book.sourceName ?? "—"}
              </dd>
            </div>
            {book.sourceUrl && (
              <div>
                <dt className="text-zinc-500">Refetch URL</dt>
                <dd className="break-all text-xs text-zinc-300">
                  <a
                    href={book.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-400 hover:text-violet-300"
                  >
                    {book.sourceUrl}
                  </a>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-zinc-500">Type</dt>
              <dd>
                <Badge>{categoryLabel(book.category)}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Adult</dt>
              <dd>
                {book.isAdult ? (
                  <Badge className="border-red-900/50 bg-red-950/50 text-red-300">
                    Yes
                  </Badge>
                ) : (
                  <span className="text-zinc-300">No</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Store cover</dt>
              <dd>
                {book.coverCorrupted ? (
                  <Badge className="border-amber-900/50 bg-amber-950/50 text-amber-300">
                    Hidden
                  </Badge>
                ) : (
                  <Badge className="border-emerald-900/50 bg-emerald-950/50 text-emerald-300">
                    Visible
                  </Badge>
                )}
              </dd>
            </div>
            {book.genres.length > 0 && (
              <div>
                <dt className="mb-1 text-zinc-500">Categories</dt>
                <dd className="flex flex-wrap gap-1">
                  {book.genres.map((genre) => (
                    <Badge key={genre} className="text-xs">
                      {genre}
                    </Badge>
                  ))}
                </dd>
              </div>
            )}
          </dl>
          <AdminSyncMetadataButton book={book} />
        </div>

        <AdminBookForm book={book} />
      </section>
    </div>
  );
}
