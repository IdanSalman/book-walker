export default function BookDetailLoading() {
  return (
    <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
      <div className="space-y-4">
        <div className="aspect-[2/3] animate-pulse rounded-xl bg-zinc-800" />
        <div className="h-8 w-28 animate-pulse rounded-full bg-zinc-800" />
      </div>
      <div className="space-y-6">
        <div className="h-9 w-2/3 animate-pulse rounded bg-zinc-800" />
        <div className="h-40 animate-pulse rounded-xl bg-zinc-900/80" />
        <div className="h-24 animate-pulse rounded-xl bg-zinc-900/80" />
      </div>
    </div>
  );
}
