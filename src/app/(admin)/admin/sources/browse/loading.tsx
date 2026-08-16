export default function AdminMihonBrowseLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-4 w-28 animate-pulse rounded bg-zinc-800" />
        <div className="h-9 w-72 animate-pulse rounded bg-zinc-800" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-zinc-800" />
      </div>
      <div className="h-28 animate-pulse rounded-xl bg-zinc-800/70" />
      <div className="space-y-px overflow-hidden rounded-xl border border-zinc-800">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="h-16 animate-pulse bg-zinc-900/40" />
        ))}
      </div>
    </div>
  );
}
