import { auth } from "@/lib/auth";
import {
  fetchLibraryPage,
  parseLibrarySort,
  type LibraryHrefParams,
} from "@/lib/library-query";
import { parseLibraryPage } from "@/lib/library-pagination";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const filterParams: LibraryHrefParams = {
    collection: url.searchParams.get("collection") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    publication: url.searchParams.get("publication") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
  };

  const result = await fetchLibraryPage({
    userId: session.user.id,
    hideAdult: session.user.hideAdultContent ?? true,
    hideRead: session.user.hideReadTitles ?? false,
    filterParams,
    sort: parseLibrarySort(filterParams.sort),
    page: parseLibraryPage(url.searchParams.get("page") ?? undefined),
  });

  return Response.json(result);
}
