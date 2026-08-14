import { BookCardSkeleton } from "@/components/book-card";

export default function StoreLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-9 w-56 animate-pulse rounded bg-zinc-800" />
        <div className="h-4 w-80 animate-pulse rounded bg-zinc-800" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-8 w-24 animate-pulse rounded-full bg-zinc-800"
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
