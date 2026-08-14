import { BookCardSkeleton } from "@/components/book-card";

export default function DashboardLoading() {
  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <div className="h-9 w-48 animate-pulse rounded bg-zinc-800" />
        <div className="h-4 w-72 animate-pulse rounded bg-zinc-800" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="h-36 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/50"
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <BookCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
