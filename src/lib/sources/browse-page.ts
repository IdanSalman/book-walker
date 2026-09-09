import { sourceEngine } from "@/lib/reader/resolve";
import {
  SOURCE_BROWSE_PAGE_SIZE,
  parseSourceBrowseSort,
  type SourceBrowseItem,
} from "@/lib/sources/browse";
import {
  annotateBrowseItems,
  resolveBrowsableSource,
} from "@/lib/sources/browsable";

export type SourceBrowsePageResult = {
  items: SourceBrowseItem[];
  page: number;
  hasMore: boolean;
  total?: number;
};

export async function fetchSourceBrowsePage(options: {
  key: string;
  userId: string;
  hideAdult: boolean;
  hideRead: boolean;
  view?: string;
  query?: string;
  categoryId?: string;
  page: number;
}): Promise<SourceBrowsePageResult | null> {
  const source = await resolveBrowsableSource(options.key);
  if (!source) return null;

  const engine = await sourceEngine(source.key);
  if (!engine?.browse) return null;

  const view = parseSourceBrowseSort(options.view);
  const result = await engine.browse({
    sort: view,
    query: options.query ?? "",
    categoryId: options.categoryId,
    page: options.page,
    limit: SOURCE_BROWSE_PAGE_SIZE,
    hideAdult: options.hideAdult,
  });

  let items = await annotateBrowseItems(
    options.hideAdult
      ? result.items.filter((item) => !item.isAdult)
      : result.items,
    options.userId,
    source.key,
  );
  if (options.hideRead) {
    items = items.filter((item) => !item.caughtUp);
  }

  return {
    items,
    page: options.page,
    hasMore: result.hasMore,
    total: result.total,
  };
}
