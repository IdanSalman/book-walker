import { auth } from "@/lib/auth";
import { shouldHideAdultBook } from "@/lib/adult-content";
import { prisma } from "@/lib/prisma";
import { canReadBook } from "@/lib/reader/access";
import { getChapterPages, refererForSourceKey } from "@/lib/reader/resolve";
import { decodeChapterId, decodeChapterIdParam, isChapterId } from "@/lib/reader/source-id";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; chapterId: string }>;
  },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, chapterId: rawChapterId } = await params;
  const chapterId = decodeChapterIdParam(rawChapterId);
  if (!isChapterId(chapterId)) {
    return Response.json({ error: "Invalid chapter" }, { status: 400 });
  }

  const hideAdult = session.user.hideAdultContent ?? true;
  const [book, userBook] = await Promise.all([
    prisma.book.findUnique({ where: { id } }),
    prisma.userBook.findUnique({
      where: {
        userId_bookId: {
          userId: session.user.id,
          bookId: id,
        },
      },
    }),
  ]);

  if (
    !book ||
    shouldHideAdultBook(hideAdult, book.isAdult) ||
    !userBook ||
    !canReadBook(book, true)
  ) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const dataSaver =
    new URL(request.url).searchParams.get("dataSaver") === "1";

  try {
    const pages = await getChapterPages(chapterId, dataSaver);
    const ref = decodeChapterId(chapterId);
    const sourceReferer = ref
      ? await refererForSourceKey(ref.sourceKey)
      : undefined;
    return Response.json({
      pages: pages.map((page) => {
        if (page.render === "pdf") {
          return {
            index: page.index,
            url: page.url,
            render: "pdf" as const,
          };
        }
        if (page.url.startsWith("/")) {
          return { index: page.index, url: page.url };
        }
        const referer = page.referer || sourceReferer;
        const params = new URLSearchParams({ u: page.url });
        if (referer) params.set("r", referer);
        if (ref?.sourceKey === "mangadex") {
          params.set("mdc", ref.payload);
          if (dataSaver) params.set("ds", "1");
        }
        return {
          index: page.index,
          url: `/api/reader/image?${params.toString()}`,
        };
      }),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load pages";
    return Response.json({ error: message }, { status: 502 });
  }
}
