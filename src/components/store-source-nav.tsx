import { FilterChip } from "@/components/filter-chip";
import type { BrowsableSource } from "@/lib/sources/browsable";

export function StoreSourceNav({
  sources,
  activeKey,
}: {
  sources: BrowsableSource[];
  activeKey?: string;
}) {
  if (sources.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-zinc-500">Source:</span>
      <FilterChip href="/library/add" active={!activeKey}>
        Catalog
      </FilterChip>
      {sources.map((source) => (
        <FilterChip
          key={source.key}
          href={`/library/add/source/${source.key}`}
          active={activeKey === source.key}
        >
          {source.name}
        </FilterChip>
      ))}
    </div>
  );
}
