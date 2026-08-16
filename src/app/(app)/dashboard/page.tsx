import Link from "next/link";

import { BookCard } from "@/components/book-card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CATEGORIES } from "@/lib/categories";
import {
  DASHBOARD_RECENT_SELECT,
  getDashboardLibraryStats,
} from "@/lib/library-stats";
import { hideAdultUserBookFilter } from "@/lib/adult-content";
import { hideReadUserBookFilter } from "@/lib/hide-read-titles";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export default async function DashboardPage() {
  const session = await requireUser();
  const hideAdult = session.user.hideAdultContent ?? true;
  const hideRead = session.user.hideReadTitles ?? false;

  const [stats, recent] = await Promise.all([
    getDashboardLibraryStats(session.user.id, hideAdult),
    prisma.userBook.findMany({
      where: {
        userId: session.user.id,
        ...hideAdultUserBookFilter(hideAdult),
        ...hideReadUserBookFilter(hideRead),
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: DASHBOARD_RECENT_SELECT,
    }),
  ]);

  const collectionCards = [
    ...stats.collections,
    ...(stats.uncategorized ? [stats.uncategorized] : []),
  ].map((cat) => ({
    ...cat,
    description: null as string | null,
    href: `/library?collection=${cat.slug}`,
  }));

  const typeCards = CATEGORIES.map((cat) => {
    const row = stats.byType.find((item) => item.category === cat.value);
    const totalPages = row?.totalPages ?? 0;
    const readPages = row?.readPages ?? 0;
    return {
      slug: cat.slug,
      name: cat.label,
      count: row?.count ?? 0,
      reading: row?.reading ?? 0,
      completed: row?.completed ?? 0,
      progress: totalPages > 0 ? (readPages / totalPages) * 100 : 0,
      description: cat.description,
      href: `/library?category=${cat.slug}`,
    };
  });

  const split = collectionCards.length ? collectionCards : typeCards;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold text-zinc-50">Dashboard</h1>
        <p className="mt-1 text-zinc-400">
          Welcome back{session.user.name ? `, ${session.user.name}` : ""}.
          You have {stats.totalCount} title
          {stats.totalCount === 1 ? "" : "s"} in your library.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {split.map((cat) => (
          <Link
            key={cat.slug}
            href={cat.href}
            prefetch
            className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 transition hover:border-zinc-600"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-semibold text-zinc-100">{cat.name}</h2>
              <Badge>{cat.count}</Badge>
            </div>
            {cat.description && (
              <p className="mt-2 text-sm text-zinc-500">{cat.description}</p>
            )}
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>
                  {cat.reading} reading · {cat.completed} completed
                </span>
                <span>{Math.round(cat.progress)}%</span>
              </div>
              <Progress value={cat.progress} />
            </div>
          </Link>
        ))}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-100">
            Recent progress
          </h2>
          <Link
            href="/library"
            className="text-sm text-violet-400 hover:text-violet-300"
          >
            View library
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-12 text-center">
            <p className="text-zinc-400">Your library is empty.</p>
            <Link
              href="/library/add"
              className="mt-2 inline-block text-sm text-violet-400 hover:text-violet-300"
            >
              Browse the store
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {recent.map((ub, index) => (
              <BookCard
                key={ub.id}
                book={ub.book}
                userBook={ub}
                href={`/books/${ub.bookId}`}
                priority={index < 8}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
