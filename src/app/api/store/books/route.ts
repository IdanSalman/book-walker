import { auth } from "@/lib/auth";
import { parseStorePage } from "@/lib/store-pagination";
import { fetchStorePage, parseStoreSort } from "@/lib/store-query";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const result = await fetchStorePage({
    userId: session.user.id,
    hideAdult: session.user.hideAdultContent ?? true,
    hideRead: session.user.hideReadTitles ?? false,
    category: url.searchParams.get("category") ?? undefined,
    genre: url.searchParams.get("genre") ?? undefined,
    sort: parseStoreSort(url.searchParams.get("sort") ?? undefined),
    q: url.searchParams.get("q") ?? undefined,
    content: url.searchParams.get("content") ?? undefined,
    publication: url.searchParams.get("publication") ?? undefined,
    page: parseStorePage(url.searchParams.get("page") ?? undefined),
  });

  return Response.json(result);
}
