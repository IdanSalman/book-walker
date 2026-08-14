import { LibraryGridSkeleton } from "@/components/library-results";

export default function LibraryLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-9 w-48 animate-pulse rounded bg-zinc-800" />
          <div className="h-4 w-40 animate-pulse rounded bg-zinc-800" />
        </div>
        <div className="h-10 w-32 animate-pulse rounded-lg bg-zinc-800" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-8 w-24 animate-pulse rounded-full bg-zinc-800"
          />
        ))}
      </div>
      <LibraryGridSkeleton />
    </div>
  );
}
