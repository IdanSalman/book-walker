import { auth } from "@/lib/auth";
import { fetchSourceBrowsePage } from "@/lib/sources/browse-page";
import { parseStorePage } from "@/lib/store-pagination";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key } = await params;
  const url = new URL(request.url);

  try {
    const result = await fetchSourceBrowsePage({
      key,
      userId: session.user.id,
      hideAdult: session.user.hideAdultContent ?? true,
      hideRead: session.user.hideReadTitles ?? false,
      view: url.searchParams.get("view") ?? undefined,
      query: url.searchParams.get("q") ?? undefined,
      categoryId: url.searchParams.get("category") ?? undefined,
      page: parseStorePage(url.searchParams.get("page") ?? undefined),
    });

    if (!result) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load titles";
    return Response.json({ error: message }, { status: 502 });
  }
}
